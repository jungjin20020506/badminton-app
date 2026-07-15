"""비즈니스 로직 — 검사기 검증(1단계). DB + judge + parsers 조합."""
import os
from app import db, judge, seed
from app.parsers import get_parser

SAMPLE_LOG = os.path.join(os.path.dirname(__file__), "parsers", "samples", "sample_pass_data.csv")


# ---------------------------------------------------------------- 조회
def bootstrap():
    return {
        "tester_types": seed.TESTER_TYPES,
        "verify_modes": seed.VERIFY_MODES,
        "photo_types": seed.PHOTO_TYPES,
        "component_types": [r["name"] for r in db.query("SELECT name FROM component_type ORDER BY sort_order")],
        "symptom_types": [r["name"] for r in db.query("SELECT name FROM symptom_type ORDER BY sort_order")],
        "flow_steps": db.query("SELECT * FROM flow_step ORDER BY step_no"),
        "testers": db.query(
            "SELECT DISTINCT model_name, model_rev, tester_type, customer FROM tester ORDER BY model_name"
        ),
    }


def get_issues(model_name=None, tester_type=None):
    # 모델명은 유연 매칭: "SM-S952 SUB" 가 이슈의 "SM-S952" 를 포함하면 매칭
    sql = "SELECT * FROM issue_history WHERE 1=1"
    args = []
    if model_name:
        sql += " AND (? LIKE '%'||model_name||'%' OR model_name LIKE '%'||?||'%')"
        args += [model_name, model_name]
    if tester_type:
        sql += " AND tester_type = ?"
        args.append(tester_type)
    return db.query(sql, args)


def _spec_map():
    return {s["item"]: s for s in db.query("SELECT * FROM judge_spec")}


def prior_unit_values(model_name, tester_type, current_unit_no, item="DIFF"):
    """양산 모드: 앞 호기들의 대표 측정값(item) 목록."""
    rows = db.query(
        """
        SELECT t.unit_no AS unit_no, m.value AS value
        FROM tester t
        JOIN inspection_run r ON r.tester_id = t.tester_id
        JOIN measurement m ON m.run_id = r.run_id
        WHERE t.model_name = ? AND t.tester_type = ?
          AND t.unit_no < ? AND m.item = ? AND m.repeat_index IS NULL
        ORDER BY t.unit_no
        """,
        (model_name, tester_type, current_unit_no or 999, item),
    )
    return rows


# ---------------------------------------------------------------- 검증 세션
def start_run(payload):
    model_name = payload.get("model_name", "").strip()
    tester_type = payload.get("tester_type", "").strip()
    unit_no = payload.get("unit_no")
    customer = payload.get("customer", "").strip()
    mode = payload.get("verify_mode", "신규").strip()

    tester_id = db.execute(
        """INSERT INTO tester(model_name,model_rev,tester_type,unit_no,board_type,
                              made_date,legal_transfer_date,verify_mode,status,customer)
           VALUES (?,?,?,?,?,?,?,?, '검증중', ?)""",
        (model_name, payload.get("model_rev", ""), tester_type, unit_no,
         payload.get("board_type", ""), payload.get("made_date", ""),
         payload.get("legal_transfer_date", ""), mode, customer),
    )
    run_id = db.execute(
        "INSERT INTO inspection_run(tester_id,inspector,verify_mode,result) VALUES (?,?,?, '진행중')",
        (tester_id, payload.get("inspector", ""), mode),
    )

    # check_item 템플릿 복제 (고객사 전용 항목은 해당 고객사만)
    tmpl = db.query(
        "SELECT * FROM check_item_template WHERE customer IS NULL OR customer = ? ORDER BY seq",
        (customer,),
    )
    conn = db.get_conn()
    for it in tmpl:
        conn.execute(
            "INSERT INTO check_item(run_id,seq,category,item_name,test_desc,criteria,result) "
            "VALUES (?,?,?,?,?,?, '미검사')",
            (run_id, it["seq"], it["category"], it["item_name"], it["test_desc"], it["criteria"]),
        )
    conn.commit()
    conn.close()

    return {
        "run_id": run_id,
        "tester_id": tester_id,
        "mode": mode,
        "mode_guide": _mode_guide(mode),
        "issues": get_issues(model_name, tester_type),
        "flow_steps": db.query("SELECT * FROM flow_step ORDER BY step_no"),
        "check_items": db.query("SELECT * FROM check_item WHERE run_id = ? ORDER BY seq", (run_id,)),
        "prior_units": prior_unit_values(model_name, tester_type, unit_no) if mode == "양산" else [],
    }


def _mode_guide(mode):
    return {
        "신규": "해당 모델 1호기 첫 검증. 순서도 전 항목을 처음부터 끝까지 검수하고, "
                "전핀 검출력(개발팀 핀맵 ↔ 회로도 대조)을 확인합니다.",
        "MODIFY": "재검증. 기존 검사기 대비 변경점(제품 테이블·마킹 위치·회로도)을 비교하여 "
                  "변경된 부분 기준으로 검출력을 재확인합니다.",
        "양산": "2호기 이상. 앞 호기 데이터와 자동 비교하여 검출력·호기 편차를 중점 확인합니다. "
                "편차가 크면 경고가 표시됩니다.",
    }.get(mode, "")


def set_check_item(item_id, result):
    db.execute("UPDATE check_item SET result = ? WHERE id = ?", (result, item_id))
    return {"ok": True}


def parse_log(run_id, text, tester_type=None, model_name=None):
    parser = get_parser(tester_type, model_name)
    parsed = parser.parse(text)
    specs = _spec_map()

    singles = [m for m in parsed["measurements"] if m.get("repeat_index") is None]
    repeats = [m for m in parsed["measurements"] if m.get("repeat_index") is not None]

    judged = judge.judge_measurements(singles, specs)

    # DB 저장 (기존 측정 삭제 후 재삽입)
    conn = db.get_conn()
    conn.execute("DELETE FROM measurement WHERE run_id = ?", (run_id,))
    for m in judged:
        conn.execute(
            "INSERT INTO measurement(run_id,item,value,spec_low,spec_high,judge,repeat_index) "
            "VALUES (?,?,?,?,?,?,NULL)",
            (run_id, m["item"], m["value"], m["spec_low"], m["spec_high"], m["judge"]),
        )
    for m in repeats:
        conn.execute(
            "INSERT INTO measurement(run_id,item,value,spec_low,spec_high,judge,repeat_index) "
            "VALUES (?,?,?,?,?,NULL,?)",
            (run_id, m["item"], m["value"], m.get("spec_low"), m.get("spec_high"), m["repeat_index"]),
        )
    conn.commit()
    conn.close()

    # 반복성 분석 (item별 그룹)
    rep_analysis = {}
    by_item = {}
    for m in repeats:
        by_item.setdefault(m["item"], []).append(m["value"])
    for item, vals in by_item.items():
        base = specs.get(judge._spec_key(item), {})
        rep_analysis[item] = judge.analyze_repeatability(
            vals, base.get("spec_low"), base.get("spec_high")
        )

    # 요약
    summary = {"정상": 0, "주의": 0, "알림": 0}
    for m in judged:
        summary[m["judge"]] = summary.get(m["judge"], 0) + 1

    # 호기 편차 비교 (양산 모드, DIFF 기준)
    run = db.query("SELECT r.*, t.model_name, t.tester_type, t.unit_no, t.verify_mode "
                   "FROM inspection_run r JOIN tester t ON t.tester_id=r.tester_id "
                   "WHERE r.run_id=?", (run_id,), one=True)
    unit_cmp = None
    if run and run["verify_mode"] == "양산":
        diff_now = next((m["value"] for m in judged if m["item"].upper().startswith("DIFF")), None)
        if diff_now is not None:
            priors = prior_unit_values(run["model_name"], run["tester_type"], run["unit_no"], "DIFF")
            unit_cmp = judge.compare_units(diff_now, priors, "DIFF")

    return {
        "measurements": judged,
        "summary": summary,
        "repeatability": rep_analysis,
        "unit_comparison": unit_cmp,
        "parser": parser.name,
    }


def finish_run(run_id, comment="", component=None, symptom_type=None):
    items = db.query("SELECT result FROM check_item WHERE run_id = ?", (run_id,))
    meas = db.query("SELECT judge FROM measurement WHERE run_id = ? AND repeat_index IS NULL", (run_id,))
    has_fail = any(i["result"] == "FAIL" for i in items) or any(m["judge"] == "알림" for m in meas)
    result = "FAIL" if has_fail else "PASS"

    db.execute("UPDATE inspection_run SET result = ?, inspector_comment = ? WHERE run_id = ?",
               (result, comment, run_id))
    run = db.query(
        "SELECT r.tester_id, r.inspector, t.model_name, t.tester_type "
        "FROM inspection_run r JOIN tester t ON t.tester_id = r.tester_id WHERE r.run_id = ?",
        (run_id,), one=True,
    )
    if run:
        db.execute("UPDATE tester SET status = '출하완료' WHERE tester_id = ?", (run["tester_id"],))
        if comment.strip():
            db.execute(
                "INSERT INTO issue_record(run_id,model_name,tester_type,component,symptom_type,raw_text,inspector) "
                "VALUES (?,?,?,?,?,?,?)",
                (run_id, run["model_name"], run["tester_type"], component or None, symptom_type or None,
                 comment, run["inspector"]),
            )
    return {"run_id": run_id, "result": result, "comment": comment}


def get_issue_records(model_name=None, component=None):
    """검수자 의견(구조화) 검색 — 모델명이 달라도 component(부품 분류)로 과거 이력을 조회. 3단계 챗봇 근거용."""
    sql = "SELECT * FROM issue_record WHERE 1=1"
    args = []
    if model_name:
        sql += " AND (? LIKE '%'||model_name||'%' OR model_name LIKE '%'||?||'%')"
        args += [model_name, model_name]
    if component:
        sql += " AND component = ?"
        args.append(component)
    sql += " ORDER BY created_at DESC"
    return db.query(sql, args)


def get_run(run_id):
    run = db.query(
        "SELECT r.*, t.model_name, t.model_rev, t.tester_type, t.unit_no, t.customer "
        "FROM inspection_run r JOIN tester t ON t.tester_id=r.tester_id WHERE r.run_id=?",
        (run_id,), one=True,
    )
    if not run:
        return None
    run["check_items"] = db.query("SELECT * FROM check_item WHERE run_id=? ORDER BY seq", (run_id,))
    run["measurements"] = db.query(
        "SELECT * FROM measurement WHERE run_id=? AND repeat_index IS NULL ORDER BY item", (run_id,))
    return run


def sample_log_text():
    with open(SAMPLE_LOG, encoding="utf-8") as f:
        return f.read()
