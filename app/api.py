"""비즈니스 로직 — 검사기 검증(1단계). DB + judge + parsers 조합."""
import base64
import os
import re
import time
from datetime import datetime
from app import db, judge, seed, tagging
from app.parsers import get_parser

SAMPLE_LOG = os.path.join(os.path.dirname(__file__), "parsers", "samples", "sample_pass_data.csv")


def _model_match(model_name, column="model_name", bidirectional=False):
    """콤마로 구분된 여러 모델명을 OR 로 묶어 부분 일치 조건을 만든다.

    'SM-S95,SM-A2' → 모델명에 SM-S95 '또는' SM-A2 가 들어 있으면 모두 매칭.
    bidirectional=True 면 검색어가 저장된 모델명을 포함하는 경우도 매칭(이슈 유연검색).
    반환: (sql_조각, args) — 유효한 term 이 없으면 (None, []).
    """
    terms = [t.strip() for t in str(model_name or "").split(",") if t.strip()]
    if not terms:
        return None, []
    parts, args = [], []
    for t in terms:
        if bidirectional:
            parts.append(f"(? LIKE '%'||{column}||'%' OR {column} LIKE '%'||?||'%')")
            args += [t, t]
        else:
            parts.append(f"{column} LIKE ?")
            args.append(f"%{t}%")
    return "(" + " OR ".join(parts) + ")", args


# ---------------------------------------------------------------- 조회
def bootstrap():
    return {
        "tester_types": seed.TESTER_TYPES,
        "verify_modes": seed.VERIFY_MODES,
        "photo_types": seed.PHOTO_TYPES,
        "component_types": [r["name"] for r in db.query("SELECT name FROM component_type ORDER BY sort_order")],
        "symptom_types": [r["name"] for r in db.query("SELECT name FROM symptom_type ORDER BY sort_order")],
        "tags": [r["name"] for r in db.query("SELECT name FROM tag ORDER BY sort_order")],
        "issue_photo_types": ISSUE_PHOTO_TYPES,
        "storage": db.storage_info(),
        # 태그 자동 추천용 정규식(클라이언트에서 즉시 매칭 — 서버왕복 없이 실시간 추천)
        "tag_rules": [{"name": n, "pattern": p} for n, p in tagging.TAG_RULES],
        "sample_logs": sample_log_names(),
        "flow_steps": db.query("SELECT * FROM flow_step ORDER BY step_no"),
        "testers": db.query(
            "SELECT DISTINCT model_name, model_rev, tester_type, customer FROM tester ORDER BY model_name"
        ),
    }


def get_stats():
    """홈 대시보드 통계 — 총 검증/PASS/FAIL/진행중/이번 달 건수, 검사기종류별 분포, 최근 검증."""
    total = db.query("SELECT COUNT(*) AS c FROM inspection_run", one=True)["c"]
    by_result = {r["result"]: r["c"] for r in
                 db.query("SELECT result, COUNT(*) AS c FROM inspection_run GROUP BY result")}
    month = db.query(
        "SELECT COUNT(*) AS c FROM inspection_run "
        "WHERE strftime('%Y-%m', run_date) = strftime('%Y-%m', 'now', 'localtime')",
        one=True)["c"]
    by_type = db.query(
        "SELECT t.tester_type AS tester_type, COUNT(*) AS c "
        "FROM inspection_run r JOIN tester t ON t.tester_id = r.tester_id "
        "GROUP BY t.tester_type ORDER BY c DESC")
    recent = db.query(
        "SELECT r.run_id, r.run_date, r.result, r.verify_mode, "
        "       t.model_name, t.tester_type, t.unit_no, t.unit_label, t.unit_list, t.customer "
        "FROM inspection_run r JOIN tester t ON t.tester_id = r.tester_id "
        "ORDER BY r.run_date DESC, r.run_id DESC LIMIT 5")
    return {
        "total": total,
        "pass": by_result.get("PASS", 0),
        "fail": by_result.get("FAIL", 0),
        "in_progress": by_result.get("진행중", 0),
        "month": month,
        "by_type": by_type,
        "recent": recent,
    }


def get_issues(model_name=None, tester_type=None):
    # 모델명은 유연 매칭: "SM-S952 SUB" 가 이슈의 "SM-S952" 를 포함하면 매칭
    sql = "SELECT * FROM issue_history WHERE 1=1"
    args = []
    if model_name:
        clause, a = _model_match(model_name, "model_name", bidirectional=True)
        if clause:
            sql += " AND " + clause
            args += a
    if tester_type:
        sql += " AND tester_type = ?"
        args.append(tester_type)
    return db.query(sql, args)


def list_issues(model_name=None, tester_type=None, customer=None, symptom_type=None, tag=None):
    """이슈 이력 관리 화면용 — 부분 일치 검색, 검증일(없으면 등록순) 최신 순.
       tag 는 콤마구분이면 AND 조건(모든 태그 포함)."""
    sql = "SELECT * FROM issue_history WHERE 1=1"
    args = []
    if model_name:
        clause, a = _model_match(model_name, "model_name")
        if clause:
            sql += " AND " + clause
            args += a
    if tester_type:
        sql += " AND tester_type = ?"
        args.append(tester_type)
    if customer:
        sql += " AND customer LIKE ?"
        args.append(f"%{customer}%")
    if symptom_type:
        sql += " AND symptom_type = ?"
        args.append(symptom_type)
    if tag:
        for one in [t.strip() for t in tag.split(",") if t.strip()]:
            sql += " AND tags LIKE ?"
            args.append(f"%,{one},%")
    # issue_date가 있으면 그 최신순, 없으면 뒤로 → 그다음 id 최신순
    sql += " ORDER BY (issue_date IS NULL) ASC, issue_date DESC, id DESC"
    rows = db.query(sql, args)
    # 재발 감지: 같은 모델+같은 증상분류가 2건 이상이면 recur 표시(비결함 분류 제외)
    agg = {(r["model_name"], r["symptom_type"]): r["c"] for r in db.query(
        "SELECT model_name, symptom_type, COUNT(*) c FROM issue_history "
        "WHERE symptom_type IS NOT NULL GROUP BY model_name, symptom_type")}
    skip = {"특이사항 없음(정상출하)", "MODIFY·시료변경 등", "기타", None}
    for r in rows:
        r["recur"] = agg.get((r["model_name"], r["symptom_type"]), 0) \
            if r.get("symptom_type") not in skip else 0
    return rows


# ---------------------------------------------------------------- 분석(대시보드)
def analytics():
    """분석 화면 데이터 한 번에 — 파레토·추이·요주의모델·태그통계·데이터품질."""
    from collections import Counter
    rows = db.query("SELECT tags, action, symptom_type, status FROM issue_history")
    total = len(rows)
    # 태그 통계 + 공출현(같은 이슈에 함께 붙은 태그 쌍)
    tag_cnt, pair_cnt = Counter(), Counter()
    for r in rows:
        ts = sorted({t for t in (r["tags"] or "").split(",") if t})
        tag_cnt.update(ts)
        for i in range(len(ts)):
            for j in range(i + 1, len(ts)):
                pair_cnt[(ts[i], ts[j])] += 1
    # 데이터 품질: 결함 이슈 중 조치 미기재율 / 태그 없는 이슈
    skip = {"특이사항 없음(정상출하)", "MODIFY·시료변경 등"}
    defects = [r for r in rows if (r["symptom_type"] or "기타") not in skip]
    no_action = sum(1 for r in defects if not (r["action"] or "").strip())
    untagged = sum(1 for r in rows if not (r["tags"] or "").strip(","))
    return {
        "pareto": defect_pareto(),
        "trend": issue_trend(12),
        "watch": watch_models(90, 8),
        "by_tester": db.query(
            "SELECT tester_type, COUNT(*) c FROM issue_history "
            "WHERE tester_type IS NOT NULL GROUP BY tester_type ORDER BY c DESC"),
        "total": total,
        "tag_stats": tag_cnt.most_common(20),
        "tag_pairs": [{"pair": f"{a} × {b}", "c": c} for (a, b), c in pair_cnt.most_common(8)],
        "quality": {
            "defect_total": len(defects),
            "no_action": no_action,
            "no_action_pct": round(no_action * 100 / len(defects), 1) if defects else 0,
            "untagged": untagged,
            "open_count": db.query(
                "SELECT COUNT(*) c FROM issue_history WHERE status IN (?,?)",
                OPEN_STATUSES, one=True)["c"],
        },
    }


def defect_pareto():
    """증상유형별 건수 + 누적 비율(파레토). 실제 불량 유형만(비결함 버킷 제외)."""
    rows = db.query(
        "SELECT symptom_type AS name, COUNT(*) AS c FROM issue_history "
        "WHERE symptom_type IS NOT NULL "
        "AND symptom_type NOT IN ('특이사항 없음(정상출하)','MODIFY·시료변경 등','기타') "
        "GROUP BY symptom_type ORDER BY c DESC")
    total = sum(r["c"] for r in rows) or 1
    out, cum = [], 0
    for r in rows:
        cum += r["c"]
        out.append({"name": r["name"], "count": r["c"],
                    "pct": round(r["c"] * 100 / total, 1),
                    "cum_pct": round(cum * 100 / total, 1)})
    return out


def issue_trend(months=12):
    """최근 N개월 월별 이슈 건수 (+ 고객사별 분리)."""
    rows = db.query(
        "SELECT substr(issue_date,1,7) AS ym, COALESCE(customer,'기타') AS cust, COUNT(*) c "
        "FROM issue_history WHERE issue_date IS NOT NULL AND length(issue_date)>=7 "
        "GROUP BY ym, cust ORDER BY ym")
    # 최근 months개 월 축 구성
    yms = sorted({r["ym"] for r in rows})[-months:]
    custs = ["드림텍", "두성테크", "한국성전"]
    series = {c: {ym: 0 for ym in yms} for c in custs}
    totals = {ym: 0 for ym in yms}
    for r in rows:
        if r["ym"] not in totals:
            continue
        totals[r["ym"]] += r["c"]
        if r["cust"] in series:
            series[r["cust"]][r["ym"]] += r["c"]
    return {
        "months": yms,
        "total": [totals[y] for y in yms],
        "series": {c: [series[c][y] for y in yms] for c in custs},
    }


def watch_models(days=90, limit=8):
    """최근 N일 이슈가 많은 '요주의 모델' Top-N (없으면 전체 기준으로 보완)."""
    recent = db.query(
        "SELECT model_name, customer, COUNT(*) c, MAX(issue_date) last_date "
        "FROM issue_history WHERE issue_date >= date('now', ?) "
        "GROUP BY model_name ORDER BY c DESC, last_date DESC LIMIT ?",
        (f"-{int(days)} days", limit))
    if len(recent) < limit:
        # 최근 데이터가 적으면 전체 누적 기준으로 채움
        recent = db.query(
            "SELECT model_name, customer, COUNT(*) c, MAX(issue_date) last_date "
            "FROM issue_history WHERE model_name IS NOT NULL "
            "GROUP BY model_name ORDER BY c DESC, last_date DESC LIMIT ?", (limit,))
    return recent


def _norm_model(m):
    """모델명 비교용 정규화 — 대소문자·공백·구분자·괄호주석 제거."""
    s = (m or "").upper()
    s = re.sub(r"\(.*?\)", "", s)          # (Q5) 같은 괄호 주석 제거
    s = re.sub(r"[\s_\-]", "", s)          # 공백·언더바·하이픈 제거
    return s.strip()


def model_duplicates(limit=40):
    """유사 모델명 감지 — 정규화 후 같거나, 접미문자 1개 차이(SM-A276 / SM-A276B)인 그룹."""
    rows = db.query(
        "SELECT model_name, COUNT(*) c, MAX(issue_date) last_date FROM issue_history "
        "WHERE model_name IS NOT NULL AND model_name != '' GROUP BY model_name")
    by_norm = {}
    for r in rows:
        by_norm.setdefault(_norm_model(r["model_name"]), []).append(r)

    groups = []
    # (1) 정규화하면 완전히 같은 것들 (표기 차이) — 확실한 중복
    for norm, items in by_norm.items():
        if len(items) > 1:
            groups.append({"kind": "표기 차이", "key": norm, "items": items})
    # (2) 접미 문자 1개 차이 (SM-A276 vs SM-A276B) — 다른 모델일 수 있어 '확인 필요'
    norms = sorted(by_norm)
    for i, a in enumerate(norms):
        for b in norms[i + 1:]:
            if not b.startswith(a):
                continue
            suf = b[len(a):]
            if len(a) >= 6 and len(suf) == 1 and suf.isalpha():
                groups.append({"kind": "접미 1자 차이(확인 필요)", "key": f"{a} / {b}",
                               "items": by_norm[a] + by_norm[b]})
    # 건수 많은 순
    for g in groups:
        g["items"] = sorted(g["items"], key=lambda x: -x["c"])
        g["total"] = sum(x["c"] for x in g["items"])
    groups.sort(key=lambda g: (-g["total"], g["key"]))
    return groups[:int(limit)]


def merge_models(from_names, to_name):
    """모델명 통합 — 선택한 이름들을 대표 이름으로 일괄 변경(이슈·검사기 모두)."""
    to_name = (to_name or "").strip()
    froms = [n for n in (from_names or []) if (n or "").strip() and n != to_name]
    if not to_name or not froms:
        raise ValueError("대표 모델명과 변경할 모델명을 지정하세요.")
    ph = ",".join("?" * len(froms))
    n_iss = db.query(f"SELECT COUNT(*) c FROM issue_history WHERE model_name IN ({ph})",
                     froms, one=True)["c"]
    db.execute(f"UPDATE issue_history SET model_name=? WHERE model_name IN ({ph})",
               [to_name] + froms)
    db.execute(f"UPDATE tester SET model_name=? WHERE model_name IN ({ph})",
               [to_name] + froms)
    audit("모델명 통합", to_name, f"{', '.join(froms)} → {to_name} (이슈 {n_iss}건)")
    return {"merged": n_iss, "to": to_name, "from": froms}


def weekly_report_draft(start, end):
    """기간 내 출하이슈를 요약한 주간보고 '초안 텍스트'를 규칙기반으로 생성."""
    start = (start or "").strip()
    end = (end or "").strip()
    where = "WHERE issue_date IS NOT NULL"
    args = []
    if start:
        where += " AND date(issue_date) >= date(?)"; args.append(start)
    if end:
        where += " AND date(issue_date) <= date(?)"; args.append(end)

    total = db.query(f"SELECT COUNT(*) c FROM issue_history {where}", args, one=True)["c"]
    by_cust = db.query(f"SELECT customer, COUNT(*) c FROM issue_history {where} "
                       "GROUP BY customer ORDER BY c DESC", args)
    by_type = db.query(f"SELECT tester_type, COUNT(*) c FROM issue_history {where} "
                       "GROUP BY tester_type ORDER BY c DESC", args)
    by_sym = db.query(f"SELECT COALESCE(symptom_type,'미분류') s, COUNT(*) c FROM issue_history {where} "
                      "GROUP BY s ORDER BY c DESC LIMIT 5", args)
    top_models = db.query(f"SELECT model_name, customer, COUNT(*) c FROM issue_history {where} "
                          "GROUP BY model_name ORDER BY c DESC LIMIT 5", args)
    notable = db.query(f"SELECT issue_date, model_name, unit_label, tester_type, title, raw_text "
                       f"FROM issue_history {where} ORDER BY issue_date DESC LIMIT 8", args)

    period = f"{start or '전체'} ~ {end or '현재'}"
    L = [f"[출하검증 주간보고 초안]  기간: {period}", ""]
    L.append(f"1. 총괄:  기간 내 출하검증 이슈 {total:,}건")
    if by_cust:
        L.append("   - 고객사별: " + ", ".join(f"{r['customer']} {r['c']}건" for r in by_cust if r['customer']))
    if by_type:
        L.append("   - 검사기별: " + ", ".join(f"{r['tester_type']} {r['c']}" for r in by_type if r['tester_type']))
    L.append("")
    if by_sym:
        L.append("2. 주요 증상 유형(Top 5):")
        for r in by_sym:
            L.append(f"   - {r['s']}: {r['c']}건")
        L.append("")
    if top_models:
        L.append("3. 이슈 다발 모델(Top 5):")
        for r in top_models:
            L.append(f"   - {r['model_name']} ({r['customer'] or '-'}) : {r['c']}건")
        L.append("")
    if notable:
        L.append("4. 주요 이슈 내역:")
        for r in notable:
            d = (r["issue_date"] or "")[:10]
            meta = " · ".join(x for x in [d, r["model_name"], r["unit_label"], r["tester_type"]] if x)
            summ = re.sub(r"\s+", " ", (r["title"] or r["raw_text"] or "")).strip()[:80]
            L.append(f"   · [{meta}] {summ}")
        L.append("")
    # 미해결·모니터링 이슈(기간 무관, 현재 열려있는 것) — 보고 필수 항목
    opens = db.query(
        "SELECT issue_date, model_name, unit_label, status, title FROM issue_history "
        "WHERE status IN (?,?) ORDER BY (issue_date IS NULL), issue_date DESC LIMIT 10",
        OPEN_STATUSES)
    if opens:
        L.append("5. 미해결·모니터링 중 이슈 (현재 기준):")
        for r in opens:
            d = (r["issue_date"] or "")[:10]
            L.append(f"   · [{d} · {r['model_name']}{' · ' + r['unit_label'] if r['unit_label'] else ''}] "
                     f"({r['status']}) {(r['title'] or '')[:60]}")
        L.append("")
    L.append("※ 본 초안은 축적된 출하이슈 데이터로 자동 생성되었습니다. 검토 후 보고에 활용하세요.")
    return {"period": period, "total": total, "text": "\n".join(L)}


def save_issue(payload):
    """이슈 이력 추가/수정 — 구조화 양식(증상*/원인/조치/상태/시료버전 + 태그).
       raw_text 는 양식에서 조립해 저장(기존 자유형 데이터와 같은 검색·챗봇 경로).
       증상분류(symptom_type)·태그 미지정 시 규칙으로 자동 부여."""
    from app import tagging
    g = lambda k: (payload.get(k) or "").strip()
    model = g("model_name")
    symptom = g("symptom") or g("raw_text")        # 증상(필수) — 구버전 raw_text도 허용
    if not model or not symptom:
        raise ValueError("모델명과 증상은 필수입니다.")
    cause, action, status = g("cause"), g("action"), g("status")
    sample_rev = g("sample_rev")
    raw = g("raw_text") if (g("raw_text") and not g("symptom")) else \
        tagging.assemble_raw(sample_rev, symptom, cause, action, status)
    title = g("title") or symptom.splitlines()[0][:50]
    unit = g("unit_label")
    date = g("issue_date")
    cust = g("customer")
    ttype = g("tester_type")
    board = g("board_type")
    stype = g("symptom_type") or tagging.classify_category(raw)
    # 태그: 사용자가 고른 것 우선, 없으면 자동 추출
    raw_tags = payload.get("tags") or []
    if isinstance(raw_tags, str):
        raw_tags = [t.strip() for t in raw_tags.split(",")]
    tags = [t for t in raw_tags if t] or tagging.auto_tags(raw)
    tags_str = tagging.tags_field(tags)
    item = (f"[{board}] " if board else "") + title
    row = (model, ttype, item, symptom, action, g("note"),
           date or None, unit or None, cust or None, board or None, raw, title, stype, tags_str,
           cause or None, status or None, sample_rev or None)
    # 충돌 감지 토큰은 마이크로초까지 — 같은 초에 두 명이 저장해도 구분된다.
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")
    editor = (payload.get("editor") or "").strip() or "익명"
    iid = payload.get("id")
    if iid:
        # 동시 편집 충돌 방지 — 내가 불러온 이후 남이 고쳤으면 저장을 막는다.
        cur = db.query("SELECT updated_at, updated_by FROM issue_history WHERE id=?", (iid,), one=True)
        base = (payload.get("base_updated_at") or "").strip()
        if cur and (cur["updated_at"] or "") and base and cur["updated_at"] != base:
            return {"conflict": True,
                    "updated_at": cur["updated_at"],
                    "updated_by": cur["updated_by"] or "다른 사용자",
                    "message": f"{cur['updated_by'] or '다른 사용자'} 님이 "
                               f"{cur['updated_at']} 에 이 이슈를 먼저 수정했습니다."}
        db.execute(
            "UPDATE issue_history SET model_name=?,tester_type=?,item=?,symptom=?,action=?,note=?,"
            "issue_date=?,unit_label=?,customer=?,board_type=?,raw_text=?,title=?,symptom_type=?,tags=?,"
            "cause=?,status=?,sample_rev=?,updated_at=?,updated_by=? WHERE id=?",
            row + (now, editor, iid))
        audit("이슈 수정", f"{model} #{iid}", f"{title} (by {editor})")
        return {"id": iid, "updated_at": now, "updated_by": editor}
    new_id = db.execute(
        "INSERT INTO issue_history(model_name,tester_type,item,symptom,action,note,"
        "issue_date,unit_label,customer,board_type,raw_text,title,symptom_type,tags,"
        "cause,status,sample_rev,updated_at,updated_by) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        row + (now, editor))
    audit("이슈 등록", f"{model} #{new_id}", f"{title} (by {editor})")
    return {"id": new_id, "updated_at": now, "updated_by": editor}


def suggest_tags(text):
    """이슈 작성 화면 '태그 자동 추천' — 입력 텍스트에서 태그·증상분류 추출."""
    from app import tagging
    return {"tags": tagging.auto_tags(text or ""),
            "symptom_type": tagging.classify_category(text or "")}


# ---------------------------------------------------------------- 감사 로그
def audit(action, target, detail=""):
    try:
        db.execute("INSERT INTO audit_log(action,target,detail) VALUES (?,?,?)",
                   (action, str(target)[:80], str(detail)[:300]))
    except Exception:
        pass


def audit_list(limit=100):
    return db.query("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", (int(limit),))


# ---------------------------------------------------------------- 유사 이슈 실시간 안내
def similar_issues(text, limit=3):
    """이슈 작성 중 입력 텍스트와 비슷한 과거 이슈 + 당시 조치를 반환(챗봇 검색엔진 재사용)."""
    from app import chatbot
    if not (text or "").strip():
        return {"hits": []}
    ctx = chatbot.retrieve(text, limit=limit)
    out = []
    for r in ctx["hits"][:limit]:
        out.append({
            "id": r.get("id"), "model": r.get("model_name"),
            "date": (r.get("issue_date") or "")[:10], "unit": r.get("unit_label"),
            "symptom": re.sub(r"\s+", " ", (r.get("symptom") or r.get("raw_text") or "")).strip()[:100],
            "action": re.sub(r"\s+", " ", (r.get("action") or "")).strip()[:120],
        })
    return {"hits": out, "tags": ctx.get("tags") or []}


# ---------------------------------------------------------------- 홈 퀵 이슈 입력
QUICK_MODEL_RE = re.compile(
    r"(SM[-_][A-Za-z0-9()]+|V[A-Z]{2,3}\d{3,4}-\d{6,7}|WATCH\d+|BUDS\d*|TAB\s?\w+)", re.I)
QUICK_UNIT_RE = re.compile(r"(\d+(?:\s*[,~]\s*\d+)*\s*호기)")


def quick_add_issue(text):
    """한 줄 텍스트에서 모델·호기·고객사를 인식해 이슈로 바로 등록."""
    text = (text or "").strip()
    if not text:
        raise ValueError("내용을 입력하세요.")
    m = QUICK_MODEL_RE.search(text)
    if not m:
        raise ValueError("모델명을 인식하지 못했습니다. 예) SM-A276 1호기 마킹 불량")
    model = m.group(1)
    unit = (QUICK_UNIT_RE.search(text) or [None]) and (
        QUICK_UNIT_RE.search(text).group(1).replace(" ", "") if QUICK_UNIT_RE.search(text) else "")
    cust = next((c for c in ("드림텍", "두성테크", "한국성전") if c in text), "")
    res = save_issue({
        "model_name": model, "customer": cust, "unit_label": unit,
        "issue_date": time.strftime("%Y-%m-%d"), "symptom": text,
    })
    audit("이슈 퀵등록", model, text[:120])
    row = db.query("SELECT * FROM issue_history WHERE id=?", (res["id"],), one=True)
    # 서버 출하이슈사항에도 기록 — 실패해도 등록 자체는 유지하되 결과를 함께 알린다
    from app import issue_export
    try:
        server_export = issue_export.export_issue(res["id"])
    except Exception as e:                                   # noqa: BLE001
        server_export = {"ok": False, "error": str(e)}
    return {"id": res["id"], "model": model, "unit": unit, "customer": cust,
            "tags": row["tags"], "symptom_type": row["symptom_type"],
            "server_export": server_export}


# ---------------------------------------------------------------- 문구 템플릿
def list_templates():
    return db.query("SELECT * FROM phrase_template ORDER BY id")


def save_template(text):
    text = (text or "").strip()
    if not text:
        raise ValueError("문구를 입력하세요.")
    return {"id": db.execute("INSERT INTO phrase_template(text) VALUES (?)", (text,))}


def delete_template(tid):
    db.execute("DELETE FROM phrase_template WHERE id=?", (int(tid),))
    return {"ok": True}


# ---------------------------------------------------------------- 이슈 사진
ISSUE_PHOTO_TYPES = ["불량 부위", "조치 후", "파형·측정값", "LCD 화면", "기구·핀블록", "기타"]


def save_issue_photo(issue_id, filename, data_url, photo_type="", caption=""):
    issue_id = int(issue_id or 0)
    if not issue_id:
        raise ValueError("issue_id가 필요합니다.")
    raw = base64.b64decode((data_url or "").split(",")[-1])
    if not raw:
        raise ValueError("이미지 데이터가 비어 있습니다.")
    if len(raw) > MAX_PHOTO_BYTES:
        raise ValueError("사진이 너무 큽니다(최대 10MB). 자동 축소에 실패했다면 캡처 범위를 줄여 주세요.")
    safe = "".join(ch for ch in os.path.basename(filename or "photo.jpg") if ch not in '\\/:*?"<>|')
    subdir = os.path.join(db.DATA_DIR, "photos", f"issue_{issue_id}")
    os.makedirs(subdir, exist_ok=True)
    name = f"{int(time.time() * 1000)}_{safe}"
    with open(os.path.join(subdir, name), "wb") as f:
        f.write(raw)
    rel = f"photos/issue_{issue_id}/{name}"
    pid = db.execute(
        "INSERT INTO issue_photo(issue_id,file_path,photo_type,caption,created_at) VALUES (?,?,?,?,?)",
        (issue_id, rel, photo_type or None, caption or None,
         time.strftime("%Y-%m-%d %H:%M:%S")))
    return {"id": pid, "file_path": rel, "photo_type": photo_type, "caption": caption}


def update_issue_photo(pid, photo_type=None, caption=None):
    db.execute("UPDATE issue_photo SET photo_type=COALESCE(?,photo_type), caption=COALESCE(?,caption) WHERE id=?",
               (photo_type, caption, int(pid)))
    return {"ok": True}


def get_issue_photos(issue_id):
    return db.query("SELECT * FROM issue_photo WHERE issue_id=? ORDER BY id", (int(issue_id),))


def delete_issue_photo(pid):
    row = db.query("SELECT * FROM issue_photo WHERE id=?", (int(pid),), one=True)
    if row:
        try:
            os.remove(os.path.join(db.DATA_DIR, row["file_path"].replace("photos/", "photos" + os.sep, 1)))
        except OSError:
            pass
        db.execute("DELETE FROM issue_photo WHERE id=?", (int(pid),))
    return {"ok": True}


# ---------------------------------------------------------------- 엑셀 붙여넣기 등록
PASTE_DATE_RE = re.compile(r"(20\d{2})[-./년\s]{1,2}(\d{1,2})[-./월\s]{1,2}(\d{1,2})")


def paste_import(model_name, customer="", tester_type="", text=""):
    """출하이슈사항 엑셀에서 복사한 텍스트(날짜+내용 행)를 파싱해 일괄 등록."""
    model_name = (model_name or "").strip()
    if not model_name:
        raise ValueError("모델명을 먼저 입력하세요.")
    lines = [l for l in (text or "").splitlines()]
    entries, cur = [], None
    for l in lines:
        m = PASTE_DATE_RE.search(l[:20])
        if m:
            if cur and cur["content"].strip():
                entries.append(cur)
            date = f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
            cur = {"date": date, "content": l[m.end():].strip("\t ")}
        elif cur is not None:
            cur["content"] += "\n" + l
        elif l.strip():
            cur = {"date": "", "content": l}
    if cur and cur["content"].strip():
        entries.append(cur)
    if not entries:
        raise ValueError("날짜/내용 형식을 인식하지 못했습니다. 엑셀에서 행을 복사해 붙여넣어 주세요.")
    n = 0
    unit_re = re.compile(r"^(\d+(?:\s*[,~]\s*\d+)*\s*호기)")
    for e in entries:
        content = e["content"].strip()
        if not content:
            continue
        mu = unit_re.match(content)
        save_issue({
            "model_name": model_name, "customer": customer, "tester_type": tester_type,
            "unit_label": mu.group(1).replace(" ", "") if mu else "",
            "issue_date": e["date"], "symptom": content,
        })
        n += 1
    audit("엑셀 붙여넣기 등록", model_name, f"{n}건")
    return {"count": n}


# ---------------------------------------------------------------- 미해결 이슈 추적
OPEN_STATUSES = ("임시조치·모니터링", "미해결·추후확인")


def open_issues(limit=50):
    rows = db.query(
        "SELECT * FROM issue_history WHERE status IN (?,?) "
        "ORDER BY (issue_date IS NULL) ASC, issue_date DESC, id DESC LIMIT ?",
        OPEN_STATUSES + (int(limit),))
    return {"count": len(rows), "rows": rows}


# ---------------------------------------------------------------- 모델 프로필
def model_profile(name):
    name = (name or "").strip()
    if not name:
        raise ValueError("모델명이 필요합니다.")
    issues = list_issues(model_name=name)
    runs = search_history({"model": name})[:100]
    units = db.query(
        "SELECT DISTINCT unit_no, tester_type, board_type FROM tester "
        "WHERE model_name LIKE ? AND unit_no IS NOT NULL ORDER BY unit_no", (f"%{name}%",))
    from collections import Counter
    tag_cnt = Counter()
    for r in issues:
        for t in (r.get("tags") or "").split(","):
            if t:
                tag_cnt[t] += 1
    st_cnt = Counter((r.get("symptom_type") or "기타") for r in issues)
    dates = sorted([r["issue_date"] for r in issues if r.get("issue_date")])
    return {
        "name": name, "issue_count": len(issues), "run_count": len(runs),
        "unit_count": len({u["unit_no"] for u in units}), "units": units,
        "first_date": dates[0] if dates else None, "last_date": dates[-1] if dates else None,
        "top_tags": tag_cnt.most_common(8),
        "by_symptom": st_cnt.most_common(6),
        "open_count": sum(1 for r in issues if r.get("status") in OPEN_STATUSES),
        "issues": issues[:200], "runs": runs[:50],
    }


def delete_issue(issue_id):
    issue_id = int(issue_id)
    row = db.query("SELECT * FROM issue_history WHERE id=?", (issue_id,), one=True)
    if not row:
        return {"ok": True}

    # 이 프로그램이 서버 출하이슈사항 엑셀에 기록한 이슈면, 엑셀의 그 행도 함께
    # 지운다. 엑셀에 남겨둔 채 여기서만 지우면 다음 서버 동기화가 되살린다.
    from app import issue_export
    r = issue_export.remove_exported(row)
    if not r.get("ok"):
        return {"error": "서버 출하이슈사항 엑셀에서 이 이슈를 지우지 못해 삭제를 중단했습니다.\n"
                         + (r.get("error") or "")}

    # 첨부 사진(파일+레코드)을 먼저 지운다 — FK 제약 때문에 사진이 남아 있으면
    # 이슈 삭제가 실패한다 (사진 있는 이슈가 안 지워지던 원인)
    for p in db.query("SELECT * FROM issue_photo WHERE issue_id=?", (issue_id,)):
        try:
            os.remove(os.path.join(db.DATA_DIR,
                                   p["file_path"].replace("photos/", "photos" + os.sep, 1)))
        except OSError:
            pass
    db.execute("DELETE FROM issue_photo WHERE issue_id=?", (issue_id,))
    db.execute("DELETE FROM issue_history WHERE id = ?", (issue_id,))
    audit("이슈 삭제", f"{row['model_name']} #{issue_id}", (row["title"] or "")
          + (" (서버 엑셀 행도 함께 삭제)" if not r.get("not_found") else ""))
    return {"ok": True, "excel_removed": not r.get("not_found")}


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
    from app import zserver
    model_name = payload.get("model_name", "").strip()
    tester_type = payload.get("tester_type", "").strip()
    customer = payload.get("customer", "").strip()
    mode = payload.get("verify_mode", "신규").strip()

    # 호기: "1" · "3~7" · "1,2,5" 처럼 여러 검사기를 한 번에 묶어 검증할 수 있다.
    #       unit_no 는 대표(첫) 호기 — 기존 통계/비교 로직과의 호환을 위해 유지.
    units = zserver.parse_units(str(payload.get("units") or payload.get("unit_no") or ""))
    unit_no = units[0] if units else None
    label = zserver.unit_label(units)

    tester_id = db.execute(
        """INSERT INTO tester(model_name,model_rev,tester_type,unit_no,unit_label,unit_list,
                              board_type,made_date,legal_transfer_date,verify_mode,status,customer)
           VALUES (?,?,?,?,?,?,?,?,?,?, '검증중', ?)""",
        (model_name, payload.get("model_rev", ""), tester_type, unit_no, label,
         ",".join(str(u) for u in units),
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
        "units": units,
        "unit_label": label,
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


def _normalize_model(s):
    return re.sub(r"[\s_\-]", "", (s or "")).upper()


def parse_log(run_id, text, tester_type=None, model_name=None):
    parser = get_parser(tester_type, model_name)
    parsed = parser.parse(text)
    specs = _spec_map()

    # 로그 헤더의 모델명이 검증 세션 모델명과 다르면 경고 (다른 검사기 로그를 붙여넣는 실수 방지)
    meta = parsed.get("meta") or {}
    log_model = _normalize_model(meta.get("model"))
    run_model = _normalize_model(model_name)
    if log_model and run_model and log_model not in run_model and run_model not in log_model:
        meta.setdefault("warnings", []).append(
            f"로그의 모델명({meta.get('model')})이 현재 검증 모델({model_name})과 다릅니다. "
            "올바른 로그인지 확인하세요.")

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

    # 반복성 분석 — 같은 항목명이라도 규격이 다르면(예: LNA 포트별 S21) 별도 시리즈로 분석.
    # 규격은 로그에 포함된 값 우선, 없으면 judge_spec 기본값.
    rep_analysis = {}
    by_key = {}
    variants = {}
    for m in repeats:
        key = (m["item"], m.get("spec_low"), m.get("spec_high"))
        by_key.setdefault(key, []).append(m["value"])
        variants.setdefault(m["item"], set()).add((m.get("spec_low"), m.get("spec_high")))
    for (item, lo, hi), vals in by_key.items():
        base = specs.get(judge._spec_key(item), {})
        lo = lo if lo is not None else base.get("spec_low")
        hi = hi if hi is not None else base.get("spec_high")
        label = item if len(variants[item]) == 1 else f"{item} ({lo}~{hi})"
        rep_analysis[label] = judge.analyze_repeatability(vals, lo, hi)

    # 요약
    summary = {"정상": 0, "주의": 0, "알림": 0}
    for m in judged:
        summary[m["judge"]] = summary.get(m["judge"], 0) + 1

    # 호기 편차 비교 (양산 모드, DIFF 기준)
    run = db.query("SELECT r.*, t.model_name, t.tester_type, t.unit_no, t.unit_label, t.verify_mode "
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
        "parser": parsed.get("parser_name", parser.name),
        "meta": meta,
    }


def finish_run(run_id, comment="", component=None, symptom_type=None, issue=None):
    """검증 완료. issue(dict: symptom/cause/action/status/sample_rev/tags)가 오면
       이슈 이력에도 자동 등록 → 이슈관리·챗봇·검사 전 안내에 바로 반영."""
    items = db.query("SELECT result FROM check_item WHERE run_id = ?", (run_id,))
    meas = db.query("SELECT judge FROM measurement WHERE run_id = ? AND repeat_index IS NULL", (run_id,))
    has_fail = any(i["result"] == "FAIL" for i in items) or any(m["judge"] == "알림" for m in meas)
    result = "FAIL" if has_fail else "PASS"

    db.execute("UPDATE inspection_run SET result = ?, inspector_comment = ? WHERE run_id = ?",
               (result, comment, run_id))
    run = db.query(
        "SELECT r.tester_id, r.inspector, t.model_name, t.model_rev, t.tester_type, "
        "       t.unit_no, t.unit_label, t.unit_list, t.customer "
        "FROM inspection_run r JOIN tester t ON t.tester_id = r.tester_id WHERE r.run_id = ?",
        (run_id,), one=True,
    )
    issue_id = None
    if run:
        db.execute("UPDATE tester SET status = '출하완료' WHERE tester_id = ?", (run["tester_id"],))
        if comment.strip():
            db.execute(
                "INSERT INTO issue_record(run_id,model_name,tester_type,component,symptom_type,raw_text,inspector) "
                "VALUES (?,?,?,?,?,?,?)",
                (run_id, run["model_name"], run["tester_type"], component or None, symptom_type or None,
                 comment, run["inspector"]),
            )
        # 검증 화면에서 작성한 이슈 → 이슈 이력 자동 등록 (모델/호기/고객사는 세션에서 채움)
        if issue and (issue.get("symptom") or "").strip():
            issue_id = save_issue({
                "model_name": run["model_name"],
                "tester_type": run["tester_type"],
                "customer": run["customer"] or "",
                "unit_label": run["unit_label"] or (f"{run['unit_no']}호기" if run["unit_no"] else ""),
                "issue_date": time.strftime("%Y-%m-%d"),
                "sample_rev": issue.get("sample_rev") or run["model_rev"] or "",
                "symptom": issue.get("symptom", ""),
                "cause": issue.get("cause", ""),
                "action": issue.get("action", ""),
                "status": issue.get("status", ""),
                "tags": issue.get("tags") or [],
            })["id"]
    # 검증 화면에서 등록한 이슈 → 서버(Z:) 출하이슈사항 엑셀에도 기록.
    # 실패하면 화면이 결과로 넘어가지 않고 오류·재시도를 안내한다(누락 방지).
    issue_export_res = None
    if issue_id:
        try:
            from app import issue_export
            issue_export_res = issue_export.export_issue(issue_id)
        except Exception as e:                                      # noqa: BLE001
            issue_export_res = {"ok": False, "error": str(e)}

    # 서버(Z:)의 출하이슈사항 엑셀을 읽어 이슈관리에 반영.
    # 실패(엑셀 열려 있음 등)해도 검증 완료 자체는 되돌리지 않고, 경고만 함께 돌려준다.
    server_issues = None
    if run:
        try:
            from app import zserver
            server_issues = zserver.import_model_issues(
                run["model_name"], run["tester_type"], run["customer"] or "")
        except Exception as e:                                      # noqa: BLE001
            server_issues = {"ok": False, "error": str(e)}

    return {"run_id": run_id, "result": result, "comment": comment,
            "issue_id": issue_id, "issue_export": issue_export_res,
            "server_issues": server_issues,
            "model_name": run["model_name"] if run else "",
            "tester_type": run["tester_type"] if run else ""}


def get_issue_records(model_name=None, component=None):
    """검수자 의견(구조화) 검색 — 모델명이 달라도 component(부품 분류)로 과거 이력을 조회. 3단계 챗봇 근거용."""
    sql = "SELECT * FROM issue_record WHERE 1=1"
    args = []
    if model_name:
        clause, a = _model_match(model_name, "model_name", bidirectional=True)
        if clause:
            sql += " AND " + clause
            args += a
    if component:
        sql += " AND component = ?"
        args.append(component)
    sql += " ORDER BY created_at DESC"
    return db.query(sql, args)


def search_history(filters):
    """검증 완료 이력 검색 — 날짜/모델명/고객사/검사기종류/판정결과로 필터링."""
    sql = """
        SELECT r.run_id, r.run_date, r.result, r.verify_mode, r.inspector, r.inspector_comment,
               t.model_name, t.model_rev, t.tester_type, t.unit_no, t.unit_label, t.unit_list, t.customer
        FROM inspection_run r
        JOIN tester t ON t.tester_id = r.tester_id
        WHERE 1=1
    """
    args = []
    start = (filters.get("start") or "").strip()
    end = (filters.get("end") or "").strip()
    model = (filters.get("model") or "").strip()
    customer = (filters.get("customer") or "").strip()
    tester_type = (filters.get("tester_type") or "").strip()
    result = (filters.get("result") or "").strip()
    if start:
        sql += " AND date(r.run_date) >= date(?)"
        args.append(start)
    if end:
        sql += " AND date(r.run_date) <= date(?)"
        args.append(end)
    if model:
        clause, a = _model_match(model, "t.model_name")
        if clause:
            sql += " AND " + clause
            args += a
    if customer:
        sql += " AND t.customer LIKE ?"
        args.append(f"%{customer}%")
    if tester_type:
        sql += " AND t.tester_type = ?"
        args.append(tester_type)
    if result:
        sql += " AND r.result = ?"
        args.append(result)
    sql += " ORDER BY r.run_date DESC LIMIT 5000"
    return db.query(sql, args)


def delete_history(run_ids):
    """선택한 검증 세션(들)을 관련 데이터(check_item/measurement/photo/issue_record/tester)와 함께 삭제."""
    run_ids = [int(i) for i in (run_ids or []) if str(i).strip()]
    if run_ids:
        audit("검증이력 삭제", f"{len(run_ids)}건", ",".join(map(str, run_ids[:20])))
    if not run_ids:
        return {"deleted": 0}

    conn = db.get_conn()
    placeholders = ",".join("?" * len(run_ids))
    tester_ids = [row["tester_id"] for row in conn.execute(
        f"SELECT tester_id FROM inspection_run WHERE run_id IN ({placeholders})", run_ids
    ).fetchall()]
    photo_paths = [row["file_path"] for row in conn.execute(
        f"SELECT file_path FROM photo WHERE run_id IN ({placeholders})", run_ids
    ).fetchall()]

    for table in ("issue_record", "photo", "measurement", "check_item", "inspection_run"):
        conn.execute(f"DELETE FROM {table} WHERE run_id IN ({placeholders})", run_ids)

    if tester_ids:
        tplaceholders = ",".join("?" * len(tester_ids))
        conn.execute(f"DELETE FROM tester WHERE tester_id IN ({tplaceholders})", tester_ids)

    conn.commit()
    conn.close()

    for rel in photo_paths:
        try:
            os.remove(os.path.join(db.DATA_DIR, *rel.split("/")))
        except OSError:
            pass
    return {"deleted": len(run_ids)}


# ---------------------------------------------------------------- 검증 사진
MAX_PHOTO_BYTES = 10 * 1024 * 1024  # 10MB


def save_photo(run_id, photo_type, filename, data_url):
    """검증 사진 저장 — 브라우저에서 base64(Data URL)로 올린 이미지를 data/photos/에 저장."""
    run_id = int(run_id or 0)
    if not run_id:
        raise ValueError("run_id가 필요합니다.")
    raw = base64.b64decode((data_url or "").split(",")[-1])
    if not raw:
        raise ValueError("이미지 데이터가 비어 있습니다.")
    if len(raw) > MAX_PHOTO_BYTES:
        raise ValueError("사진이 너무 큽니다(최대 10MB). 크기를 줄여 다시 올려주세요.")

    safe = "".join(ch for ch in os.path.basename(filename or "photo.jpg") if ch not in '\\/:*?"<>|')
    subdir = os.path.join(db.DATA_DIR, "photos", f"run_{run_id}")
    os.makedirs(subdir, exist_ok=True)
    name = f"{int(time.time() * 1000)}_{safe}"
    with open(os.path.join(subdir, name), "wb") as f:
        f.write(raw)

    rel = f"photos/run_{run_id}/{name}"
    pid = db.execute("INSERT INTO photo(run_id,photo_type,file_path) VALUES (?,?,?)",
                     (run_id, photo_type or "", rel))
    return {"id": pid, "run_id": run_id, "photo_type": photo_type or "", "file_path": rel, "url": "/" + rel}


def get_photos(run_id):
    rows = db.query("SELECT * FROM photo WHERE run_id = ? ORDER BY id", (int(run_id or 0),))
    for r in rows:
        r["url"] = "/" + r["file_path"]
    return rows


def delete_photo(photo_id):
    row = db.query("SELECT * FROM photo WHERE id = ?", (int(photo_id),), one=True)
    if row:
        try:
            os.remove(os.path.join(db.DATA_DIR, *row["file_path"].split("/")))
        except OSError:
            pass
        db.execute("DELETE FROM photo WHERE id = ?", (int(photo_id),))
    return {"ok": True}


def backup_db():
    """로컬 DB 파일을 그대로 내려받기(백업)."""
    from datetime import datetime
    with open(db.DB_PATH, "rb") as f:
        content = f.read()
    return content, f"quality_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"


def get_run(run_id):
    run = db.query(
        "SELECT r.*, t.model_name, t.model_rev, t.tester_type, t.unit_no, t.unit_label, t.unit_list, t.customer "
        "FROM inspection_run r JOIN tester t ON t.tester_id=r.tester_id WHERE r.run_id=?",
        (run_id,), one=True,
    )
    if not run:
        return None
    run["check_items"] = db.query("SELECT * FROM check_item WHERE run_id=? ORDER BY seq", (run_id,))
    run["measurements"] = db.query(
        "SELECT * FROM measurement WHERE run_id=? AND repeat_index IS NULL ORDER BY item", (run_id,))
    # 이어서 하기(재개)·상세 화면에서 검증 화면과 동일한 정보를 쓸 수 있도록 함께 반환
    run["mode"] = run["verify_mode"]
    run["mode_guide"] = _mode_guide(run["verify_mode"])
    run["issues"] = get_issues(run["model_name"], run["tester_type"])
    run["flow_steps"] = db.query("SELECT * FROM flow_step ORDER BY step_no")
    run["prior_units"] = (prior_unit_values(run["model_name"], run["tester_type"], run["unit_no"])
                          if run["verify_mode"] == "양산" else [])
    run["photos"] = get_photos(run_id)
    return run


REAL_SAMPLE_DIR = os.path.join(os.path.dirname(__file__), "parsers", "samples", "real")


def sample_log_text(name=None):
    """기본 CSV 샘플 또는 실제 장비 로그 샘플(name 지정 시)을 반환."""
    if name:
        safe = os.path.basename(name)
        path = os.path.join(REAL_SAMPLE_DIR, safe if safe.endswith(".log") else safe + ".log")
        if not os.path.isfile(path):
            raise ValueError(f"샘플 로그가 없습니다: {safe}")
        with open(path, encoding="utf-8", errors="replace") as f:
            return f.read()
    with open(SAMPLE_LOG, encoding="utf-8") as f:
        return f.read()


def sample_log_names():
    """실제 장비 로그 샘플 파일 이름 목록."""
    if not os.path.isdir(REAL_SAMPLE_DIR):
        return []
    return sorted(fn[:-4] for fn in os.listdir(REAL_SAMPLE_DIR) if fn.endswith(".log"))


def build_report(run_id):
    try:
        from app import report
    except ImportError as e:
        raise RuntimeError(
            "엑셀 출력 기능에는 openpyxl 설치가 필요합니다. "
            "명령 프롬프트에서 'pip install openpyxl' 실행 후 다시 시도하세요."
        ) from e
    return report.build_checksheet(run_id)


def build_issues_export(model=None, tester_type=None, customer=None, symptom_type=None, tag=None):
    from app import report
    rows = list_issues(model, tester_type, customer, symptom_type, tag)
    return report.build_issues_export(rows)


def build_history_export(filters):
    try:
        from app import report
    except ImportError as e:
        raise RuntimeError(
            "엑셀 출력 기능에는 openpyxl 설치가 필요합니다. "
            "명령 프롬프트에서 'pip install openpyxl' 실행 후 다시 시도하세요."
        ) from e
    rows = search_history(filters)
    return report.build_history_export(rows)


def build_weekly_report(start_date, end_date):
    try:
        from app import report
    except ImportError as e:
        raise RuntimeError(
            "엑셀 출력 기능에는 openpyxl 설치가 필요합니다. "
            "명령 프롬프트에서 'pip install openpyxl' 실행 후 다시 시도하세요."
        ) from e
    return report.build_weekly_report(start_date, end_date)
