"""SQLite 연결 및 초기화 헬퍼. 표준 라이브러리(sqlite3)만 사용."""
import os
import sqlite3

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 데이터 디렉터리:
#  - KNK_DATA_DIR 환경변수가 있으면 그 경로
#  - Vercel/서버리스(읽기전용 FS)면 /tmp (쓰기 가능)
#  - 그 외 로컬 실행이면 프로젝트/data
if os.environ.get("KNK_DATA_DIR"):
    DATA_DIR = os.environ["KNK_DATA_DIR"]
elif os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
    DATA_DIR = "/tmp/knk-data"
else:
    DATA_DIR = os.path.join(BASE_DIR, "data")

DB_PATH = os.path.join(DATA_DIR, "quality.db")
SCHEMA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "schema.sql")


def get_conn():
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """스키마 생성 후, 비어 있으면 초기 데이터를 시딩한다."""
    conn = get_conn()
    with open(SCHEMA_PATH, encoding="utf-8") as f:
        conn.executescript(f.read())
    conn.commit()

    # 시딩 여부 판단 (flow_step 비었으면 최초 실행으로 간주)
    cnt = conn.execute("SELECT COUNT(*) AS c FROM flow_step").fetchone()["c"]
    if cnt == 0:
        from app import seed
        seed.seed_all(conn)
        conn.commit()

    # issue_history 구조화 컬럼 보강(기존 DB 마이그레이션) — 이슈 양식(증상/원인/조치/상태/시료)
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(issue_history)").fetchall()}
    for col in ("issue_date", "unit_label", "customer", "board_type", "raw_text", "title",
                "symptom_type", "tags", "cause", "status", "sample_rev",
                "updated_at", "updated_by"):
        if col not in cols:
            conn.execute(f"ALTER TABLE issue_history ADD COLUMN {col} TEXT")
    # issue_photo 메타 컬럼 보강
    pcols = {r["name"] for r in conn.execute("PRAGMA table_info(issue_photo)").fetchall()}
    for col in ("photo_type", "caption", "created_at"):
        if col not in pcols:
            conn.execute(f"ALTER TABLE issue_photo ADD COLUMN {col} TEXT")
    conn.commit()

    # 자주 쓰는 문구 템플릿 — 비어 있으면 기본 문구 시딩
    if conn.execute("SELECT COUNT(*) AS c FROM phrase_template").fetchone()["c"] == 0:
        conn.executemany("INSERT INTO phrase_template(text) VALUES (?)", [
            ("0.4 시료로 검토 진행.",), ("특이 사항 없음.",),
            ("FW 수정하여 개선 진행.",), ("핀블록 컨텍 재조정 후 정상 확인.",),
            ("가성 불량 발생으로 재측정 진행.",), ("고객사 협의 후 출하 진행.",),
            ("재조립 후 재측정 → 정상 확인.",), ("추후 모니터링 필요.",),
        ])
        conn.commit()

    # 태그 표준목록(20종) 시딩 — 비어 있으면 채움
    if conn.execute("SELECT COUNT(*) AS c FROM tag").fetchone()["c"] == 0:
        from app import seed
        conn.executemany("INSERT INTO tag(name,sort_order) VALUES (?,?)",
                         [(name, i) for i, name in enumerate(seed.TAG_VOCAB)])
        conn.commit()

    # 기존 DB에 새 테이블(component_type/symptom_type)만 추가된 경우 대비 — 별도 시딩
    comp_cnt = conn.execute("SELECT COUNT(*) AS c FROM component_type").fetchone()["c"]
    if comp_cnt == 0:
        from app import seed
        conn.executemany(
            "INSERT INTO component_type(name,sort_order) VALUES (?,?)",
            [(name, i) for i, name in enumerate(seed.COMPONENT_TYPES)],
        )
        conn.executemany(
            "INSERT INTO symptom_type(name,sort_order) VALUES (?,?)",
            [(name, i) for i, name in enumerate(seed.SYMPTOM_TYPES)],
        )
        conn.commit()

    _upgrade_checklist(conn)
    _cleanup_legacy_seed(conn)
    conn.close()


def _upgrade_checklist(conn):
    """검증 체크리스트를 '통합 22단계'로 갱신(기존 DB 마이그레이션, 멱등).
       예전 순서도(절차)+체크시트(항목) 이원 구조를 하나로 합친 개정판을 반영한다.
       이미 진행된 검증 세션의 check_item 기록은 건드리지 않는다."""
    try:
        from app import seed
        exists = conn.execute(
            "SELECT COUNT(*) c FROM check_item_template WHERE item_name = ?",
            ("시리얼 통신·USB 인식 확인",)).fetchone()["c"]
        if exists:
            return                              # 이미 개정판
        conn.execute("DELETE FROM check_item_template")
        conn.executemany(
            "INSERT INTO check_item_template(seq,category,item_name,test_desc,criteria,customer) "
            "VALUES (?,?,?,?,?,?)", seed.CHECK_ITEMS)
        conn.execute("DELETE FROM flow_step")
        conn.executemany(
            "INSERT INTO flow_step(step_no,title,action,description) VALUES (?,?,?,?)",
            seed.FLOW_STEPS)
        conn.commit()
        print("[안내] 검증 체크리스트를 통합 22단계로 갱신했습니다.")
    except Exception as e:  # noqa: BLE001
        print(f"[안내] 체크리스트 갱신 건너뜀: {e}")


def _cleanup_legacy_seed(conn):
    """예전 데모/시드 더미를 자동 제거(멱등). 실데이터는 항상 raw_text가 있고,
       시드 더미 검사기의 검사자는 '이전검사자' 라는 점으로 안전하게 구분한다."""
    try:
        # 1) 시드 더미 이슈(raw_text 없는 과거 예시들) 제거
        conn.execute("DELETE FROM issue_history WHERE raw_text IS NULL")
        # 2) 시드 더미 검사기(호기)와 그 세션·자식행 제거
        seed_runs = [r["run_id"] for r in
                     conn.execute("SELECT run_id FROM inspection_run WHERE inspector='이전검사자'")]
        if seed_runs:
            ph = ",".join("?" * len(seed_runs))
            tids = [r["tester_id"] for r in
                    conn.execute(f"SELECT DISTINCT tester_id FROM inspection_run WHERE run_id IN ({ph})",
                                 seed_runs) if r["tester_id"] is not None]
            for tbl in ("issue_record", "photo", "measurement", "check_item", "inspection_run"):
                conn.execute(f"DELETE FROM {tbl} WHERE run_id IN ({ph})", seed_runs)
            if tids:
                tph = ",".join("?" * len(tids))
                conn.execute(f"DELETE FROM tester WHERE tester_id IN ({tph})", tids)
        conn.commit()
    except Exception as e:  # noqa: BLE001
        print(f"[정리 안내] 레거시 시드 정리 건너뜀: {e}")


def query(sql, args=(), one=False):
    conn = get_conn()
    cur = conn.execute(sql, args)
    rows = cur.fetchall()
    conn.close()
    result = [dict(r) for r in rows]
    return (result[0] if result else None) if one else result


def execute(sql, args=()):
    conn = get_conn()
    cur = conn.execute(sql, args)
    conn.commit()
    lastrow = cur.lastrowid
    conn.close()
    return lastrow
