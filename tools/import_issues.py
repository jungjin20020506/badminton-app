# -*- coding: utf-8 -*-
"""
Z: 서버의 고객사(드림텍/두성테크/한국성전) 출하검증 폴더 안 '출하이슈사항' 엑셀을
읽어 프로그램 DB(issue_history / issue_record) 형식으로 정리한다.

- Z: 서버 파일은 '읽기 전용'으로만 접근 (수정/이동/삭제 금지)
- 고객사별 모델 10개를 랜덤 선정 (내용이 실제로 있는 파일 우선, 모델 중복 제거)
"""
import os, re, sys, json, random, argparse
import openpyxl

# 태그·증상분류 규칙은 앱과 단일 소스 공유 (app/tagging.py)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.tagging import (SYMPTOM_TYPES, TAG_VOCAB,             # noqa: E402
                         classify_category, auto_tags, tags_field)

CUSTOMERS = ["드림텍", "두성테크", "한국성전"]
LIST_DIR = os.environ.get("ISSUE_LIST_DIR", "/tmp")  # /tmp/issue_<customer>.txt (git bash) → win path 변환
SEED = 20260716
N_PER_CUSTOMER = 10

# 검사기 폴더명 → 표준 검사기 종류
def norm_tester(raw):
    s = raw
    s = re.sub(r"^\s*\d+\s*[.\-]\s*", "", s)          # "1. " 접두 제거
    s = re.sub(r"관리코드[_\s]*", "", s)
    low = s.lower()
    table = [
        (["방수", "wp", "water"], "방수"),
        (["vswr"], "VSWR"),
        (["lna"], "LNA"),
        (["proximity", "근조도", "근 조도", "조도"], "PROXIMITY"),
        (["지문", "finger"], "지문"),
        (["tsp", "touch", "터치"], "TSP"),
    ]
    for keys, std in table:
        if any(k in low for k in keys):
            return std
    # 그 외(센서/MIC/TDR/OS/RS/특성/기능 등)는 기능검사기 계열로 보되 원명 보존
    return "기능검사기"


def clean(s):
    return re.sub(r"\s+", " ", (s or "").strip())


def path_parts(path, customer):
    # /z/<customer>/... 또는 Z:\<customer>\... 를 표준화
    norm = path.replace("\\", "/")
    marker = "/" + customer + "/"
    idx = norm.find(marker)
    rel = norm[idx + len(marker):] if idx >= 0 else norm
    return [p for p in rel.split("/") if p]


# 모델명 판별 규칙 (사용자 확정):
#   경로: <고객사>/<카테고리루트>/<모델>/[부위...]/<검사기폴더>/<출하검증>/<파일>
#   - 모델 = 카테고리 루트(제조/자동화/SUB PBA/연구소 등) 바로 아래 폴더
#           (드림텍·두성: SM-* 등 / 한국성전: V**-0****** 코드 / 그 외 프로젝트 코드)
#   - 부위(board) = 모델과 검사기 사이의 SUB/POGO/MMW/FRC/BAROMETER 등 (PBA 구분)
#   - 검사기 종류(tester_type) = 맨 아래 번호 폴더("2. 012T2602_기능검사기")에서 정규화
SM_RE = re.compile(r"^(SM[-_]|SGH[-_]|GT[-_]|EO[-_]|EP[-_])", re.I)
VCODE_RE = re.compile(r"^V[A-Z]{2,3}\d{3,4}")                     # VCF0776-0126000, VMA0166 ...
PROJECT_RE = re.compile(r"^(GW\d|WATCH\d|BUDS\d?|TAB\b|Q\d\b)", re.I)  # SM 없는 삼성 프로젝트 코드


def _looks_like_model(seg):
    return bool(SM_RE.search(seg) or VCODE_RE.search(seg) or PROJECT_RE.search(seg))


def derive_model_tester(path, customer):
    parts = path_parts(path, customer)          # 고객사 이후 세그먼트 (파일 포함)
    # parts[-1]=파일, parts[-2]=출하검증 폴더, parts[-3]=검사기 폴더
    tester_dir = parts[-3] if len(parts) >= 3 else (parts[-2] if len(parts) >= 2 else "")
    mids = parts[1:-2]                           # 루트(0)·출하검증(-2)·파일(-1) 제외 → [모델..부위..검사기]
    cand = mids[:-1] if len(mids) >= 2 else mids  # 검사기 폴더 제거 → [모델, 부위...]
    if not cand:
        cand = [parts[1]] if len(parts) >= 2 else [""]
    # 모델 위치: 좌측부터 첫 모델형 세그먼트, 없으면 루트 바로 아래(첫 세그먼트)
    model_idx = 0
    for i, seg in enumerate(cand):
        if _looks_like_model(seg):
            model_idx = i
            break
    model = cand[model_idx].strip()
    board = " ".join(cand[model_idx + 1:]).strip() or None   # 부위 (board_type)
    return model, board, tester_dir


def find_content_col(ws_rows):
    """헤더 행에서 '내역/내용' 열 인덱스를 찾음. 없으면 None."""
    for row in ws_rows[:6]:
        for i, v in enumerate(row):
            if v and any(k in str(v) for k in ("내역", "내용", "이슈", "특이")):
                if str(v).strip() not in ("출하 이슈사항 관리", "출하이슈사항"):
                    return i
    return None


DATE_RE = re.compile(r"(20\d{2})[-./](\d{1,2})[-./](\d{1,2})")


def parse_date(v):
    if v is None:
        return None
    s = str(v).strip()
    m = DATE_RE.search(s)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    return None


def split_symptom_action(text):
    """호기 내역 텍스트를 증상('-.') / 조치('->','→') 로 분리."""
    lines = [l.strip() for l in re.split(r"[\r\n]+", text) if l.strip()]
    unit = ""
    symptoms, actions = [], []
    for l in lines:
        mu = re.match(r"^(\d+(?:\s*[,~]\s*\d+)*\s*호기)", l)
        if mu and not unit:
            unit = mu.group(1).replace(" ", "")
            rest = l[mu.end():].strip(" .-")
            if rest:
                symptoms.append(rest)
            continue
        body = re.sub(r"^[-.\s]+", "", l)
        if "->" in l or "→" in l:
            act = re.split(r"->|→", l, 1)[1].strip(" .-")
            if act:
                actions.append(act)
        elif body:
            symptoms.append(body)
    return unit, symptoms, actions


def read_issue_file(path):
    """엑셀에서 (date, unit, symptom, action, raw) 엔트리 리스트 추출."""
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    entries = []
    for ws in wb.worksheets:
        rows = [list(r) for r in ws.iter_rows(values_only=True)]
        if not rows:
            continue
        ccol = find_content_col(rows)
        for row in rows:
            date = parse_date(row[0]) if row else None
            # 내용 셀: 지정 열 우선, 없으면 가장 긴 비-날짜 셀
            content = None
            if ccol is not None and ccol < len(row) and row[ccol]:
                content = str(row[ccol])
            else:
                cand = [str(c) for c in row if c and not parse_date(c) and "호기" in str(c)]
                if cand:
                    content = max(cand, key=len)
            if not content:
                continue
            if "호기" not in content and not date:
                continue
            unit, symptoms, actions = split_symptom_action(content)
            if not symptoms and not actions:
                continue
            entries.append({
                "date": date, "unit": unit,
                "symptom": " / ".join(symptoms),
                "action": " / ".join(actions),
                "raw": content.strip(),
            })
    wb.close()
    return entries


def load_candidates(customer):
    lp = os.path.join(LIST_DIR, f"issue_{customer}.txt")
    with open(lp, encoding="utf-8") as f:
        files = [l.strip() for l in f if l.strip()]
    # git-bash 경로(/z/..) → 윈도우 경로(Z:\..)
    out = []
    for p in files:
        if p.startswith("/z/"):
            p = "Z:\\" + p[3:].replace("/", "\\")
        out.append(p)
    return out


# 고객사별 모델 필터 (전체 정리 모드)
VCODE_MODEL_RE = re.compile(r"^V[A-Z]{2,3}\d{3,4}-\d")   # 한국성전 V**-0****** 코드
def _is_sm(m): return m.upper().startswith("SM")
MODEL_FILTERS = {
    "드림텍":  _is_sm,
    "두성테크": _is_sm,
    "한국성전": lambda m: bool(VCODE_MODEL_RE.match(m)),
}


def collect_all(customer, files=None):
    """고객사의 '모든' 출하이슈파일 중 모델 필터를 통과하는 것을 전부 정리.
       files 를 주면(서버 동기화) 목록파일 대신 그 경로들을 사용."""
    keep = MODEL_FILTERS[customer]
    if files is None:
        files = load_candidates(customer)
    picked, models = [], set()
    n_total = n_pass = n_empty = 0
    for p in files:
        if not os.path.isfile(p):
            continue
        n_total += 1
        model, board, tester_dir = derive_model_tester(p, customer)
        if not keep(model):
            continue                                  # 필터 탈락(경로만으로 판정 — 엑셀 미read)
        n_pass += 1
        try:
            entries = read_issue_file(p)
        except Exception:
            continue
        if not entries:
            n_empty += 1
            continue
        models.add(model)
        picked.append({
            "customer": customer, "model": model, "board": board,
            "tester_dir": tester_dir, "tester_type": norm_tester(tester_dir),
            "path": p, "entries": entries,
        })
    print(f"[{customer}] 대상파일 {n_total} · 필터통과 {n_pass} · 내용有 {len(picked)} · "
          f"내용無(빈템플릿) {n_empty} · 고유모델 {len(models)} · 이슈엔트리 "
          f"{sum(len(x['entries']) for x in picked)}건")
    return picked


def select(customer, rng):
    files = load_candidates(customer)
    rng.shuffle(files)
    seen_models = set()
    picked = []
    for p in files:
        if not os.path.isfile(p):
            continue
        model, board, tester_dir = derive_model_tester(p, customer)
        if model in seen_models:
            continue
        try:
            entries = read_issue_file(p)
        except Exception as e:
            continue
        if not entries:
            continue
        seen_models.add(model)
        picked.append({
            "customer": customer, "model": model, "board": board,
            "tester_dir": tester_dir, "tester_type": norm_tester(tester_dir),
            "path": p, "entries": entries,
        })
        if len(picked) >= N_PER_CUSTOMER:
            break
    return picked

# (증상분류/태그 규칙은 app/tagging.py 에서 import — 단일 소스)

COMPONENT_RULES = [
    ("마이크", ["마이크", "mic", "음샘"]),
    ("핀블록", ["핀블록", "핀 블록", "핀블럭", "pogo", "포고", "실린더", "푸셔"]),
    ("커넥터", ["커넥터", "connector", "c-clip", "clip", "클립"]),
    ("케이블", ["케이블", "cable", "usb"]),
    ("센서", ["센서", "sensor", "근조도", "조도", "barometer", "기압", "안전 센서"]),
    ("소프트웨어", ["fw", "펌웨어", "프로그램", "통신", "소프트", "cal", "offset"]),
    ("보드", ["보드", "pba", "기판", "회로"]),
    ("스피커", ["스피커", "speaker"]),
    ("카메라", ["카메라", "camera"]),
]


def classify(text, rules):
    low = (text or "").lower()
    for label, keys in rules:
        if any(k.lower() in low for k in keys):
            return label
    return None


def make_title(unit, symptom, raw):
    """이슈 제목 = 원문의 첫 의미있는 한 줄(호기 라인 제외), 없으면 증상 앞부분."""
    for line in (raw or "").splitlines():
        s = re.sub(r"^[-.\s]+", "", line).strip()
        if not s:
            continue
        mu = re.match(r"^\d+(?:\s*[,~]\s*\d+)*\s*호기", s)
        if mu:
            rest = s[mu.end():].strip(" .-")
            if rest:
                return rest[:50]
            continue
        return s[:50]
    return (symptom or "출하검증 이슈")[:50]


TAG = "[출하이슈자동수집]"           # issue_history.note 멱등 태그
REC_TAG = "출하이슈자동수집"          # issue_record.inspector 멱등 태그
RUN_TAG = "출하검증이관"             # inspection_run.inspector 멱등 태그 (히스토리 이관분)


def parse_unit_no(unit_label):
    """'1호기'→1, '2~5호기'→2, '1,2호기'→1, ''→None (대표 호기 번호)."""
    m = re.search(r"(\d+)", unit_label or "")
    return int(m.group(1)) if m else None


def parse_verify_mode(unit_label, raw):
    t = (unit_label or "") + " " + (raw or "")
    if re.search(r"modify", t, re.I):
        return "MODIFY"
    n = parse_unit_no(unit_label)
    if "~" in (unit_label or "") or "," in (unit_label or "") or (n and n >= 2):
        return "양산"
    return "신규"


# 검사자 판정은 출하이슈사항 원본에 없음 → 판정을 추정/조작하지 않고 중립 표기.
# 히스토리 뱃지는 PASS/FAIL 이 아니므로 '주의'(노랑)로 렌더링되고, 홈 PASS/FAIL
# 통계에 섞이지 않으며 '이어서 하기'(진행중) 대상에서도 제외된다.
RESULT_LABEL = "출하완료"


def parse_rev(raw):
    """'R0.5', 'R 0.3A', '0.4 시료' 등에서 시료 버전 토큰 추출 (있으면 model_rev로)."""
    m = re.search(r"\bR\s?\d\.\d[A-Za-z]?\b", raw or "")
    if m:
        return m.group(0).replace(" ", "")
    m = re.search(r"\b\d\.\d[A-Za-z]?\s*(?:버전|시료)", raw or "")
    if m:
        return "R" + m.group(0).split()[0]
    return None


def commit_to_db(data):
    # 프로젝트 루트를 import 경로에 추가
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sys.path.insert(0, root)
    from app import db
    db.init_db()

    conn = db.get_conn()
    conn.execute("PRAGMA foreign_keys = OFF")   # 대량 정비 중 참조무결성 임시 해제

    # issue_history 확장 컬럼 (없으면 추가) — 이슈관리 화면용 정규 항목
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(issue_history)").fetchall()}
    for col in ("issue_date", "unit_label", "customer", "board_type", "raw_text", "title",
                "symptom_type", "tags"):
        if col not in cols:
            conn.execute(f"ALTER TABLE issue_history ADD COLUMN {col} TEXT")

    # 증상 분류 표준목록 갱신(근거기반 10종+버킷) — 필터 드롭다운/통계에 반영
    conn.execute("DELETE FROM symptom_type")
    conn.executemany("INSERT INTO symptom_type(name,sort_order) VALUES (?,?)",
                     [(name, i) for i, name in enumerate(SYMPTOM_TYPES)])

    # 태그 표준목록(20종) 테이블 — 이슈 작성 시 클릭 선택/검색용
    conn.execute("CREATE TABLE IF NOT EXISTS tag (name TEXT PRIMARY KEY, sort_order INTEGER)")
    conn.execute("DELETE FROM tag")
    conn.executemany("INSERT INTO tag(name,sort_order) VALUES (?,?)",
                     [(name, i) for i, name in enumerate(TAG_VOCAB)])

    # 멱등: 이전 이관분(히스토리 세션 + 이슈 + 원문) 제거 -----------------------
    old_runs = [r["run_id"] for r in
                conn.execute("SELECT run_id FROM inspection_run WHERE inspector = ?", (RUN_TAG,)).fetchall()]
    if old_runs:
        ph = ",".join("?" * len(old_runs))
        old_testers = [r["tester_id"] for r in
                       conn.execute(f"SELECT DISTINCT tester_id FROM inspection_run WHERE run_id IN ({ph})",
                                    old_runs).fetchall() if r["tester_id"] is not None]
        for tbl in ("issue_record", "check_item", "measurement", "photo", "inspection_run"):
            conn.execute(f"DELETE FROM {tbl} WHERE run_id IN ({ph})", old_runs)
        if old_testers:
            tph = ",".join("?" * len(old_testers))
            conn.execute(f"DELETE FROM tester WHERE tester_id IN ({tph})", old_testers)
    conn.execute("DELETE FROM issue_history WHERE note LIKE ?", (f"%{TAG}%",))
    conn.execute("DELETE FROM issue_record WHERE inspector = ?", (REC_TAG,))

    n_hist = n_rec = n_tester = n_run = 0
    tester_cache = {}   # (model,ttype,unit_no,cust) → tester_id (호기 중복 제거)

    # 프로그램이 서버 엑셀에 직접 기록한 내역은 다시 들이지 않는다(중복 방지) —
    # 원본 이슈가 issue_history 에 이미 있고, 자동수집 태그가 없어 위 삭제에서도 살아남는다.
    _norm_exp = lambda s: re.sub(r"\s+", " ", str(s or "")).strip()   # noqa: E731
    try:
        exported = {_norm_exp(r["server_export_text"]) for r in conn.execute(
            "SELECT server_export_text FROM issue_history "
            "WHERE server_export_text IS NOT NULL AND server_export_text != ''").fetchall()}
    except Exception:                                   # noqa: BLE001 — 구버전 DB(컬럼 없음)
        exported = set()

    n_skip_exported = 0
    for m in data:
        cust, model, tdir, ttype = m["customer"], m["model"], m["tester_dir"], m["tester_type"]
        board = m.get("board")
        src = m["path"]
        for e in m["entries"]:
            symptom = e["symptom"] or e["raw"]
            action = e["action"]
            unit = e["unit"] or ""
            date = e["date"] or ""
            raw = e["raw"]
            if _norm_exp(raw) in exported:      # 프로그램이 기록한 행 — 건너뜀
                n_skip_exported += 1
                continue

            # 1) 이슈 이력(이슈관리 화면 + 검사 전 안내 + AS 근거) --------------
            title = make_title(unit, symptom, raw)
            board_tag = f"[{board}] " if board else ""
            item = board_tag + title            # 목록 제목(부위 태그 + 제목)
            note = (f"{TAG} 고객사:{cust} · 부위:{board or '-'} · 검사기:{tdir} · "
                    f"검증일:{date or '미기재'} · 출처:{src}")
            stype_h = classify_category(raw)         # 근거기반 증상 분류(주 분류)
            tags_h = tags_field(auto_tags(raw))       # 다중 태그(원자)
            conn.execute(
                "INSERT INTO issue_history(model_name,tester_type,item,symptom,action,note,"
                "issue_date,unit_label,customer,board_type,raw_text,title,symptom_type,tags) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (model, ttype, item, symptom, action, note,
                 date or None, unit or None, cust, board, raw, title, stype_h, tags_h))
            n_hist += 1

            # 2) 히스토리 세션(검사기 호기 + 검증세션) --------------------------
            unit_no = parse_unit_no(unit)
            vmode = parse_verify_mode(unit, raw)
            result = RESULT_LABEL
            rev = parse_rev(raw)
            tkey = (model, board, ttype, unit_no, cust)
            tid = tester_cache.get(tkey)
            if tid is None:
                cur = conn.execute(
                    "INSERT INTO tester(model_name,model_rev,tester_type,unit_no,board_type,"
                    "made_date,verify_mode,status,customer) VALUES (?,?,?,?,?,?,?,?,?)",
                    (model, rev, ttype, unit_no, board, date or None, vmode, "출하완료", cust))
                tid = cur.lastrowid
                tester_cache[tkey] = tid
                n_tester += 1

            # 검증세션 코멘트 = 출하이슈사항 '원문 그대로' (상세화면에 원본 노출)
            comment = raw
            if board or tdir:
                comment += f"\n\n— 부위 {board or '-'} · 검사기 {tdir} · 출하이슈사항 원문"

            run_cur = conn.execute(
                "INSERT INTO inspection_run(tester_id,inspector,run_date,verify_mode,result,inspector_comment) "
                "VALUES (?,?,?,?,?,?)",
                (tid, RUN_TAG, date or None, vmode, result, comment))
            rid = run_cur.lastrowid
            n_run += 1

            # 3) 검수자 의견 원문 보존(3단계 근거) — 이제 run_id로 연결 ----------
            stype = classify_category(raw)
            comp = classify(raw, COMPONENT_RULES)
            conn.execute(
                "INSERT INTO issue_record(run_id,model_name,tester_type,component,symptom_type,"
                "raw_text,summary,action,inspector,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (rid, model, ttype, comp, stype, raw, symptom, action, REC_TAG, date or None))
            n_rec += 1

    conn.commit()
    conn.close()
    print(f"DB 반영 완료 → issue_history {n_hist}건, 검사기(호기) {n_tester}대, "
          f"히스토리 세션 {n_run}건, issue_record {n_rec}건"
          + (f" · 프로그램 기록분 건너뜀 {n_skip_exported}건" if n_skip_exported else ""))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="tools/selected_issues.json")
    ap.add_argument("--commit", action="store_true", help="JSON 재생성 후 DB 반영")
    ap.add_argument("--from-json", help="기존 JSON을 읽어 DB에만 반영")
    ap.add_argument("--all", action="store_true",
                    help="랜덤10개가 아니라 고객사별 모델필터를 통과하는 '전체' 출하이슈 정리")
    args = ap.parse_args()

    if args.from_json:
        data = json.load(open(args.from_json, encoding="utf-8"))
        commit_to_db(data)
        return

    result = []
    if args.all:
        for c in CUSTOMERS:
            result.extend(collect_all(c))
    else:
        rng = random.Random(SEED)
        for c in CUSTOMERS:
            picked = select(c, rng)
            print(f"[{c}] 선정 모델 {len(picked)}개 / 총 이슈엔트리 "
                  f"{sum(len(x['entries']) for x in picked)}건")
            result.extend(picked)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print("저장:", args.out, "· 총 파일", len(result))
    if args.commit:
        commit_to_db(result)


if __name__ == "__main__":
    main()


# ---------------------------------------------------------------------------
# 서버 스캔(파이썬) — 앱의 "서버 동기화" 버튼용. Z:\<고객사> 를 얕게 훑어
# '출하검증' 폴더를 찾고, 그 안의 '출하이슈사항' 파일만 나열한다. (읽기 전용)
# ---------------------------------------------------------------------------
def _server_root():
    """사내 서버 루트 경로를 찾는다.
       우선순위: 환경변수 → 설정파일(data/server_path.txt) → 흔한 후보 자동탐색.
       PC마다 드라이브 문자가 다르거나(Z:/Y:) UNC(\\\\서버\\공유)로 붙는 경우를 모두 지원."""
    env = os.environ.get("KNK_SERVER_ROOT", "").strip()
    if env:
        return env
    try:
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        from app import db as _db
        cfg = os.path.join(_db.DATA_DIR, "server_path.txt")
        if os.path.isfile(cfg):
            saved = open(cfg, encoding="utf-8").read().strip()
            if saved:
                return saved
    except Exception:
        pass
    # 후보 자동 탐색 — 고객사 폴더가 실제로 보이는 경로를 채택
    for cand in ("Z:\\", "Y:\\", "X:\\", "W:\\", "V:\\", "U:\\",
                 r"\\knkwork\KNKWORK", r"\\192.168.123.6\KNKWORK"):
        try:
            if os.path.isdir(cand) and any(
                    os.path.isdir(os.path.join(cand, c)) for c in CUSTOMERS):
                return cand
        except OSError:
            continue
    return "Z:\\"


SCAN_ROOT = _server_root()
SKIP_DIRS = ("DATA", "출하사진", "동영상", "Cal_data", "검사 항목별", "SURGE")


def scan_customer(customer, max_depth=6, progress=None, root_dir=None):
    """고객사 폴더에서 출하이슈사항 파일 경로 목록을 수집(BFS, 깊이 제한)."""
    base = root_dir or SCAN_ROOT
    root = os.path.join(base, customer)
    if not os.path.isdir(root):
        raise FileNotFoundError(
            f"서버 폴더를 찾을 수 없습니다: {root}\n"
            f"· 이 PC에 사내 서버가 연결(드라이브 매핑)돼 있는지 확인하세요.\n"
            f"· 드라이브 문자가 다르면(예: Y:) 이슈관리 화면의 '서버 경로 설정'에서 바꿔 주세요.")
    files, queue = [], [(root, 0)]
    scanned = 0
    while queue:
        d, depth = queue.pop(0)
        try:
            entries = os.scandir(d)
        except OSError:
            continue
        for e in entries:
            try:
                if not e.is_dir():
                    continue
            except OSError:
                continue
            name = e.name
            if any(s in name for s in SKIP_DIRS):
                continue
            if "출하검증" in name:
                # 출하검증 폴더 안의 이슈 파일만(비재귀) 확인
                try:
                    for f in os.scandir(e.path):
                        if f.is_file() and "출하이슈사항" in f.name and f.name.endswith(".xlsx"):
                            files.append(f.path)
                except OSError:
                    pass
                continue          # 출하검증 내부로는 더 안 내려감(DATA 등 대용량)
            if depth < max_depth:
                queue.append((e.path, depth + 1))
        scanned += 1
        if progress and scanned % 200 == 0:
            progress(f"{customer} 폴더 스캔 중… ({scanned}개 폴더, 파일 {len(files)}개 발견)")
    return files


def sync_from_server(progress=lambda msg: None, root_dir=None):
    """전체 동기화: 스캔 → 필터 → 파싱 → DB 재반영(멱등). 진행 콜백으로 상태 보고."""
    base = root_dir or _server_root()
    progress(f"서버 경로 확인: {base}")
    result = []
    for c in CUSTOMERS:
        progress(f"[1/3] {c} 서버 폴더 스캔 중…")
        found = scan_customer(c, progress=progress, root_dir=base)
        progress(f"[2/3] {c} 이슈파일 {len(found)}개 파싱 중… (모델 필터 적용)")
        result.extend(collect_all(c, files=found))
    progress("[3/3] 데이터베이스 반영 중…")
    commit_to_db(result)
    total = sum(len(x["entries"]) for x in result)
    progress(f"완료 — 파일 {len(result)}개, 이슈 {total}건 반영")
    return {"files": len(result), "issues": total}
