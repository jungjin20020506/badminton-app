# -*- coding: utf-8 -*-
"""
KNK AS 챗봇 (3단계) — 규칙기반 검색 엔진.

돈 안 드는 오프라인 데모용. DB에 축적된 출하이슈(issue_history)와 출하검사
순서도(flow_step)를 검색해 답변한다. 외부 API·인터넷·설치가 전혀 필요 없다.

■ 나중에 OpenAI(또는 로컬 LLM)가 연결되면:
   answer() 안의 provider 분기만 살아나고, 나머지(검색·컨텍스트 구성)는 그대로
   재사용된다. 검색 결과(retrieve())를 LLM 프롬프트의 근거로 넘기면 된다.
   => 환경변수 KNK_LLM_PROVIDER 를 openai/ollama 등으로 지정하면 _llm_answer()가
      호출되고, 실패하거나 미설정이면 규칙기반(_rule_answer)으로 자동 폴백한다.
"""
import json
import os
import re
import urllib.request
from app import db

CONFIG_PATH = os.path.join(db.DATA_DIR, "chatbot_config.json")
OLLAMA_URL = os.environ.get("KNK_OLLAMA_URL", "http://127.0.0.1:11434")


def get_config():
    """챗봇 엔진 설정 — 파일 우선, 환경변수로 보완. UI 토글이 파일을 갱신.

    api_key(OpenAI)는 data/chatbot_config.json 에만 저장된다 — data/ 는
    깃허브에 절대 커밋되지 않는 폴더라 공개 저장소로 새어나가지 않는다.
    """
    cfg = {"provider": "", "model": "llama3.2",
           "api_key": "", "openai_model": "gpt-4o-mini"}
    try:
        with open(CONFIG_PATH, encoding="utf-8") as f:
            cfg.update({k: v for k, v in json.load(f).items() if v is not None})
    except Exception:
        pass
    if os.environ.get("KNK_LLM_PROVIDER"):
        cfg["provider"] = os.environ["KNK_LLM_PROVIDER"]
    if os.environ.get("KNK_LLM_MODEL"):
        cfg["model"] = os.environ["KNK_LLM_MODEL"]
    if not cfg.get("api_key") and os.environ.get("OPENAI_API_KEY"):
        cfg["api_key"] = os.environ["OPENAI_API_KEY"]
    return cfg


def public_config():
    """화면에 보내는 설정 — API 키 원문은 절대 내보내지 않는다(설정 여부만)."""
    cfg = get_config()
    return {"provider": cfg["provider"], "model": cfg["model"],
            "openai_model": cfg.get("openai_model") or "gpt-4o-mini",
            "openai_key_set": bool((cfg.get("api_key") or "").strip())}


def set_config(provider=None, model=None, api_key=None, openai_model=None):
    cfg = get_config()
    if provider is not None:
        cfg["provider"] = provider
    if model:
        cfg["model"] = model
    if api_key is not None and api_key.strip():          # 빈 문자열로는 못 지움(실수 방지)
        cfg["api_key"] = api_key.strip()
    if openai_model:
        cfg["openai_model"] = openai_model.strip()
    os.makedirs(db.DATA_DIR, exist_ok=True)
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump({"provider": cfg["provider"], "model": cfg["model"],
                   "api_key": cfg.get("api_key") or "",
                   "openai_model": cfg.get("openai_model") or "gpt-4o-mini"},
                  f, ensure_ascii=False)
    return cfg


def ollama_status():
    """로컬 Ollama 설치·구동 여부와 사용 가능 모델 확인(연결 안 되면 available=False)."""
    try:
        with urllib.request.urlopen(f"{OLLAMA_URL}/api/tags", timeout=0.8) as r:
            data = json.loads(r.read().decode("utf-8"))
        models = [m.get("name", "") for m in data.get("models", [])]
        return {"available": True, "models": models}
    except Exception:
        return {"available": False, "models": []}

TESTER_TYPES = ["기능검사기", "방수", "VSWR", "LNA", "PROXIMITY", "지문", "TSP"]
CUSTOMERS = ["드림텍", "두성테크", "한국성전"]

MODEL_RE = re.compile(
    r"(SM[-_][A-Za-z0-9()]+|V[A-Z]{2,3}\d{3,4}-\d{6,7}|WATCH\d+|BUDS\d*|TAB\s?\w+)", re.I)

# 검색어에서 걸러낼 조사·군더더기
STOP = set("""
이 그 저 것 좀 관련 이슈 이력 알려줘 알려 어떤 무슨 있어 있었 있나 있니 뭐 뭐야 대해 대한
검사기 모델 문제 사항 내용 정리 요약 해줘 해 주세요 그리고 은 는 을 를 에 의 에서 으로 로
과거 이전 확인 부탁 좀더 자세히 무엇 어떻게 어떤게 대하여 관해 관하여
""".split())


def _detect(q):
    models = [m if isinstance(m, str) else m[0] for m in MODEL_RE.findall(q)]
    tt = next((t for t in TESTER_TYPES if t.lower() in q.lower()), None)
    cust = next((c for c in CUSTOMERS if c in q), None)
    return models, tt, cust


def _keywords(q):
    toks = re.findall(r"[가-힣A-Za-z0-9]+", q)
    return [t for t in toks if len(t) >= 2 and t not in STOP]


# 질문 키워드 → 증상 분류(근거기반 10종) 매핑. "마이크/OS" 질문을 해당 유형으로 라우팅.
CATEGORY_HINTS = [
    ("마이크·음샘", ["마이크", "음샘", "mic"]),
    ("OS·통신·저장", ["os", "통신", "저장", "부팅", "데이터로거", "datalogger"]),
    ("FW·펌웨어·다운로드", ["fw", "펌웨어", "펌웨", "다운로드", "다운"]),
    ("마킹", ["마킹", "마커"]),
    ("RF·파형·전류(VSWR/서지)", ["파형", "전류", "전압", "서지", "vswr", "임피던스", "이득", "rf"]),
    ("크랙·파손·눌림", ["크랙", "크렉", "파손", "눌림", "찍힘", "깨짐", "스크래치"]),
    ("커넥터·케이블·보드(PCB)", ["커넥터", "케이블", "클립", "보드", "pcb", "기판", "역삽", "점퍼", "이어잭"]),
    ("가성불량(오검출)", ["가성", "오검출", "가검출"]),
    ("핀블록·컨텍 검출력", ["핀블록", "핀블럭", "컨텍", "컨택", "검출력", "포고", "pogo", "프로브"]),
    ("기구·안착·간섭", ["푸셔", "플로팅", "간섭", "안착", "실린더", "진공", "기구", "젠더", "낌"]),
]


def _detect_category(q):
    low = (q or "").lower()
    for cat, keys in CATEGORY_HINTS:
        if any(k in low for k in keys):
            return cat
    return None


_TAG_CACHE = None


def _tag_vocab():
    global _TAG_CACHE
    if _TAG_CACHE is None:
        _TAG_CACHE = [r["name"] for r in db.query("SELECT name FROM tag ORDER BY sort_order")]
    return _TAG_CACHE


def _detect_tags(q):
    """질문에 등장하는 태그(원자) 목록. '/' 로 나뉜 태그는 어느 한쪽만 나와도 인정."""
    low = (q or "").lower()
    found = []
    for tag in _tag_vocab():
        for atom in tag.split("/"):
            a = atom.strip().lower()
            if len(a) >= 2 and a in low:
                found.append(tag)
                break
    return found


def retrieve(question, limit=6):
    """질문에서 모델/검사기/고객사/키워드/증상분류/태그를 뽑아 관련 이슈를 랭킹해 반환."""
    models, tt, cust = _detect(question)
    kws = _keywords(question)
    category = _detect_category(question)
    q_tags = _detect_tags(question)

    sql = "SELECT * FROM issue_history WHERE 1=1"
    args = []
    if models:
        ors = " OR ".join(["model_name LIKE ?"] * len(models))
        sql += f" AND ({ors})"
        args += [f"%{m}%" for m in models]
    if tt:
        sql += " AND tester_type = ?"
        args.append(tt)
    if cust:
        sql += " AND (customer = ? OR note LIKE ?)"
        args += [cust, f"%{cust}%"]
    rows = db.query(sql, args)

    structured = bool(models or tt or cust)
    # 구조적 필터가 없으면 전체에서 키워드로만 검색
    if not structured:
        rows = db.query("SELECT * FROM issue_history")

    def text_of(r):
        return " ".join(str(r.get(k) or "") for k in
                        ("title", "raw_text", "symptom", "action", "model_name",
                         "board_type", "tester_type", "customer", "item", "note"))

    def score(r):
        t = text_of(r)
        s = sum(t.count(k) for k in kws) * 3
        if r.get("raw_text"):
            s += 1
        if category and r.get("symptom_type") == category:
            s += 5                       # 질문 유형과 같은 증상 분류를 우선
        rtags = (r.get("tags") or "")
        s += 4 * sum(1 for tg in q_tags if f",{tg}," in rtags)   # 겹치는 태그마다 가점
        # 조치(action)가 실제로 적힌 사례를 우대 — "어떻게 조치했나"에 유용
        if (r.get("action") or "").strip():
            s += 2
        return s

    scored = [(score(r), r) for r in rows]
    if structured or category or q_tags:
        scored = [x for x in scored if True]
    else:
        scored = [x for x in scored if x[0] > 0]
    scored.sort(key=lambda x: x[0], reverse=True)
    hits = [r for _, r in scored[:limit]]

    category_total = None
    if category:
        row = db.query("SELECT COUNT(*) c FROM issue_history WHERE symptom_type=?",
                       (category,), one=True)
        category_total = row["c"] if row else None
    return {"models": models, "tester_type": tt, "customer": cust,
            "keywords": kws, "category": category, "category_total": category_total,
            "tags": q_tags, "hits": hits, "total": len(scored)}


# --------------------------------------------------------------------------- 포맷
def _excerpt(r, n=160):
    raw = (r.get("raw_text") or r.get("symptom") or "").strip()
    raw = re.sub(r"\s*\n\s*", " / ", raw)
    return raw[:n] + ("…" if len(raw) > n else "")


def _source(r, terms=None):
    """근거 카드. terms 를 주면 발췌문에서 일치 구간을 [[..]] 로 표시(프론트에서 하이라이트)."""
    ex = _excerpt(r)
    if terms:
        # 긴 단어부터 치환해 부분 겹침 방지
        for t in sorted({t for t in terms if len(t) >= 2}, key=len, reverse=True):
            try:
                ex = re.sub(f"({re.escape(t)})", r"[[\1]]", ex, flags=re.I)
            except re.error:
                pass
        ex = re.sub(r"\[\[(\[\[)+", "[[", ex)      # 중첩 마커 정리
        ex = re.sub(r"(\]\])+\]\]", "]]", ex)
    return {
        "id": r.get("id"),
        "model": r.get("model_name"),
        "customer": r.get("customer"),
        "tester_type": r.get("tester_type"),
        "board_type": r.get("board_type"),
        "unit": r.get("unit_label"),
        "date": (r.get("issue_date") or "")[:10],
        "title": r.get("title") or r.get("item"),
        "excerpt": ex,
    }


def _flow_answer():
    steps = db.query("SELECT * FROM flow_step ORDER BY step_no")
    lines = [f"{s['step_no']}. {s['title']}" + (f" — {s['action']}" if s.get("action") else "")
             for s in steps]
    reply = "📋 출하검사 순서도 (총 %d단계)\n\n" % len(steps) + "\n".join(lines[:22])
    return {"reply": reply, "sources": [], "chips": _default_chips()}


def _stats_answer():
    total = db.query("SELECT COUNT(*) c FROM issue_history", one=True)["c"]
    by_cust = db.query(
        "SELECT customer, COUNT(*) c FROM issue_history WHERE customer IS NOT NULL "
        "GROUP BY customer ORDER BY c DESC")
    by_type = db.query(
        "SELECT tester_type, COUNT(*) c FROM issue_history WHERE tester_type IS NOT NULL "
        "GROUP BY tester_type ORDER BY c DESC LIMIT 6")
    top_sym = db.query(
        "SELECT symptom_type, COUNT(*) c FROM issue_record WHERE symptom_type IS NOT NULL "
        "GROUP BY symptom_type ORDER BY c DESC LIMIT 5")
    reply = f"📊 현재 축적된 출하이슈는 총 {total:,}건입니다.\n\n"
    if by_cust:
        reply += "· 고객사별: " + ", ".join(f"{r['customer']} {r['c']:,}건" for r in by_cust) + "\n"
    if by_type:
        reply += "· 검사기별: " + ", ".join(f"{r['tester_type']} {r['c']:,}" for r in by_type) + "\n"
    if top_sym:
        reply += "· 많은 증상 유형: " + ", ".join(f"{r['symptom_type']}({r['c']})" for r in top_sym)
    return {"reply": reply, "sources": [], "chips": _default_chips()}


def _default_chips():
    return ["출하검사 순서 알려줘", "드림텍 방수 이슈", "음샘 불량 대처법",
            "SM-F971U 이슈", "전체 이슈 통계"]


def _help_answer():
    reply = (
        "안녕하세요! KNK 출하검증 AS 도우미예요. 🤖\n\n"
        "축적된 출하이슈 데이터와 검사 순서도를 바탕으로 답변합니다. 이렇게 물어보세요:\n"
        "· \"SM-F971U VSWR 이슈 알려줘\" — 특정 모델/검사기 과거 이슈\n"
        "· \"드림텍 방수 불량\" — 고객사·검사기별 이슈\n"
        "· \"음샘 가성불량 어떻게 조치했어?\" — 증상 키워드 검색\n"
        "· \"출하검사 순서 알려줘\" — 순서도 22단계\n"
        "· \"전체 이슈 통계\" — 건수 요약"
    )
    return {"reply": reply, "sources": [], "chips": _default_chips()}


def _rule_answer(question, ctx):
    q = question.strip()
    low = q.lower()

    # 인사/도움말
    if not q or re.search(r"안녕|하이|hi|hello|도움|사용법|뭐 할|뭐할|기능|help", low):
        return _help_answer()
    # 순서도
    if re.search(r"순서|절차|단계|플로우|flow|순서도", low):
        return _flow_answer()
    # 통계
    if re.search(r"통계|몇\s*건|건수|가장 많|제일 많|분포|얼마나", low):
        return _stats_answer()

    hits = ctx["hits"]
    if not hits:
        # 근거 못 찾음 → 안내 + 존재하는 예시 제시
        sample = db.query(
            "SELECT DISTINCT model_name FROM issue_history WHERE model_name IS NOT NULL "
            "ORDER BY id DESC LIMIT 6")
        eg = ", ".join(s["model_name"] for s in sample)
        reply = ("음… 해당 내용으로는 과거 이슈를 찾지 못했어요. 😥\n"
                 "모델명이나 검사기 종류(방수·VSWR·LNA 등), 고객사(드림텍·두성테크·한국성전)를 "
                 f"넣어 다시 물어봐 주세요.\n\n예시 모델: {eg}")
        return {"reply": reply, "sources": [], "chips": _default_chips()}

    # 근거 기반 구조화 답변 (규칙기반)
    who = []
    if ctx["models"]:
        who.append("/".join(ctx["models"]))
    if ctx["customer"]:
        who.append(ctx["customer"])
    if ctx["tester_type"]:
        who.append(ctx["tester_type"])
    subject = " · ".join(who) if who else "요청하신 내용"

    head = f"🔎 '{subject}' 관련 과거 출하이슈 {min(len(hits), 6)}건을 찾았어요.\n"
    if ctx.get("category"):
        head = (f"🔎 '{subject}' — [{ctx['category']}] 유형(전체 {ctx['category_total']}건)에서 "
                f"유사 사례를 찾았어요.\n")

    parts = [head]
    # ① 먼저 확인할 곳 — 감지된 태그 기반
    checks = [TAG_CHECK_HINTS[t] for t in (ctx.get("tags") or []) if t in TAG_CHECK_HINTS]
    if checks:
        parts.append("\n① 먼저 확인해 보세요:\n" + "\n".join(f"  - {c}" for c in checks[:4]))

    # ② 과거 조치 사례 — 실제 '조치'가 적힌 사례 우선
    acted = [r for r in hits if (r.get("action") or "").strip()][:4]
    show = acted or hits[:4]
    parts.append("\n② 과거 조치 사례:")
    for r in show:
        meta = " · ".join(x for x in [(r.get("issue_date") or "")[:10], r.get("model_name"),
                                      r.get("unit_label")] if x)
        sym = re.sub(r"\s+", " ", (r.get("symptom") or "")).strip()[:90]
        act = re.sub(r"\s+", " ", (r.get("action") or "")).strip()[:120]
        line = f"  · [{meta}]"
        if sym:
            line += f" 증상: {sym}"
        if act:
            line += f"\n     → 조치: {act}"
        parts.append(line)

    parts.append("\n③ 위 사례를 참고해 조치해 보시고, 해결되지 않으면 증상을 더 자세히 알려주세요. "
                 "(더 똑똑한 답변은 상단 '🧠 로컬 AI' 를 켜면 과거 사례+AI 지식으로 조치를 제안해줍니다.)")
    reply = "\n".join(parts)
    hl = (ctx.get("keywords") or []) + (ctx.get("tags") or [])
    return {"reply": reply, "sources": [_source(r, hl) for r in hits[:6]], "chips": _default_chips()}


# 태그 → '먼저 확인' 힌트 (규칙기반 답변용)
TAG_CHECK_HINTS = {
    "마이크": "MIC/음샘 러버 압착·홀 막힘, MIC CAL 값, 마이크 컨텍 상태",
    "가성불량": "반복성 재측정으로 재현 여부 확인(가성이면 검사기측 문제), 컨텍·핀 접촉 안정성",
    "파형/전류": "핀/케이블 접촉, RF 커넥터 체결, CAL/보정값, 계측기 상태",
    "핀블록": "핀 마모·높이·컨텍 상태, 핀블록 플로팅·정렬",
    "컨텍/접촉": "PCB 패드 세척, 핀 컨텍/교체, 안착 위치·눌림량",
    "메인보드/PCB": "보드 불량 여부(교체 비교), 공급전압 안정성, 커넥터 체결",
    "검출력": "핀 컨텍·규격, 시료 안착, 임계값/스펙 설정",
    "반복성": "동일 시료 다회 측정 산포 확인, 컨텍 안정성, 값 흔들림 원인부",
    "커넥터": "커넥터 체결·역삽 여부, 클립/핀 정렬",
    "케이블": "케이블 연결·높이·손상, RF 케이블 체결",
    "마킹": "마킹 SOL 동작·위치, 마킹 높이/행정 설정",
    "FW": "FW 버전 일치, 재다운로드, CPU Format 후 재설치",
    "OS/통신": "통신 속도/포트, 저장(DataLogger) 설정, 부팅·ID 체크",
    "간섭": "기구 간섭부 도피, 안착 단차, 푸셔/가이드 정렬",
    "안착": "제품 안착 위치·평탄, 스토퍼·가이드, 진공/솔 동작",
    "푸셔": "푸셔 플로팅·행정·정렬, 가스켓/오링 간섭",
    "크랙/파손": "제품 테이블 재질·단차, 눌림량, 안착 충격",
    "센서": "센서 거리/조도 셋팅, 안전센서 동작, 기준자 정렬",
    "테이블": "제품 테이블 도면 일치·단차, 재질(베이크라이트 등) 크랙",
    "젠더": "젠더 접촉·정렬, RF 젠더 체결 상태",
}


# --------------------------------------------------------------------------- LLM 어댑터
SYSTEM_PROMPT = (
    "당신은 KNK 품질팀의 '검사기 출하검증 AS 도우미'입니다. 검사기(테스터) 정비 실무자를 돕습니다.\n"
    "아래 [과거 조치 사례]는 실제 이 회사가 겪고 조치한 이력입니다. 이 사례들의 '조치'를 최우선 근거로 삼되, "
    "당신의 일반 지식(전자·계측·기구 정비)을 더해 실전적으로 답하세요.\n"
    "다음 형식을 지켜 한국어로 간결하게 답하세요:\n"
    "① 먼저 확인할 곳: (증상으로 볼 때 가장 먼저 점검할 후보 1~3개)\n"
    "② 과거 조치 사례: (제공된 사례에서 실제로 통했던 조치를 요약. 날짜·모델 언급)\n"
    "③ 추천 조치: (위를 종합한 단계별 조치 제안)\n"
    "④ 마무리: '이대로 안 되면 증상을 더 알려주세요' 같은 후속 안내.\n"
    "과거 사례에 근거가 약하면 솔직히 말하고 일반적 점검법을 제시하세요. 사실을 지어내지 마세요."
)


def _build_context_text(ctx):
    lines = []
    for i, r in enumerate(ctx["hits"][:6], 1):
        meta = " · ".join(x for x in [(r.get("issue_date") or "")[:10], r.get("model_name"),
                                      r.get("unit_label"), r.get("tester_type")] if x)
        sym = re.sub(r"\s+", " ", (r.get("symptom") or "")).strip()[:160]
        act = re.sub(r"\s+", " ", (r.get("action") or "")).strip()[:160]
        block = f"{i}) [{meta}]"
        if sym:
            block += f"\n   - 증상: {sym}"
        if act:
            block += f"\n   - 조치: {act}"
        if not sym and not act:
            block += f" {_excerpt(r, 200)}"
        tg = (r.get("tags") or "").strip(",")
        if tg:
            block += f"\n   - 태그: {tg}"
        lines.append(block)
    return "\n".join(lines) if lines else "(관련 과거 이슈 없음)"


def _ollama_answer(question, ctx, model):
    """로컬 Ollama(무료) 호출. 검색 근거를 프롬프트에 넣어 답변 생성."""
    tag_line = ("관련 태그: " + ", ".join(ctx.get("tags") or []) + "\n") if ctx.get("tags") else ""
    prompt = (f"{tag_line}[과거 조치 사례]\n{_build_context_text(ctx)}\n\n"
              f"[질문]\n{question}\n\n위 형식(①~④)에 맞춰 답해주세요.")
    payload = {
        "model": model,
        "messages": [{"role": "system", "content": SYSTEM_PROMPT},
                     {"role": "user", "content": prompt}],
        "stream": False,
        "options": {"temperature": 0.3},
    }
    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/chat",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.loads(r.read().decode("utf-8"))
    reply = (data.get("message") or {}).get("content", "").strip()
    if not reply:
        raise ValueError("빈 응답")
    hl = (ctx.get("keywords") or []) + (ctx.get("tags") or [])
    return {"reply": reply, "sources": [_source(x, hl) for x in ctx["hits"][:5]],
            "chips": _default_chips(), "mode": "llm", "model": model}


def _pick_model(cfg):
    """실제 설치된 Ollama 모델 중에서 사용할 모델을 정한다.
       설정한 모델이 없으면 '설치된 첫 모델'을 자동 사용 → 이름 안 맞아도 그냥 동작."""
    status = ollama_status()
    if not status["available"]:
        raise ConnectionError("Ollama 미실행/미설치")
    avail = status["models"]
    if not avail:
        raise ValueError("설치된 모델이 없습니다. (ollama pull 필요)")
    want = (cfg.get("model") or "").strip()
    if want:
        for m in avail:                   # 설정 모델이 설치돼 있으면 그대로
            if m == want:
                return m
        for m in avail:                   # 태그 빼고 이름만 일치해도 사용
            if m.split(":")[0] == want.split(":")[0]:
                return m
    # 설정 모델이 없으면 '가장 큰(똑똑한)' 모델 자동 선택 — 작은 모델은 문맥을 놓침
    def size(m):
        mt = re.search(r"(\d+(?:\.\d+)?)\s*b", m.lower())
        return float(mt.group(1)) if mt else 0.0
    return max(avail, key=size)


def _openai_answer(question, ctx, cfg):
    """OpenAI Chat Completions 호출 — 같은 검색 근거(ctx)를 프롬프트로 재사용."""
    api_key = (cfg.get("api_key") or "").strip()
    if not api_key:
        raise ValueError("OpenAI API 키가 설정되지 않았습니다.")
    model = (cfg.get("openai_model") or "gpt-4o-mini").strip()
    tag_line = ("관련 태그: " + ", ".join(ctx.get("tags") or []) + "\n") if ctx.get("tags") else ""
    prompt = (f"{tag_line}[과거 조치 사례]\n{_build_context_text(ctx)}\n\n"
              f"[질문]\n{question}\n\n위 형식(①~④)에 맞춰 답해주세요.")
    payload = {
        "model": model,
        "messages": [{"role": "system", "content": SYSTEM_PROMPT},
                     {"role": "user", "content": prompt}],
        "temperature": 0.3,
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json",
                 "Authorization": f"Bearer {api_key}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.loads(r.read().decode("utf-8"))
    reply = (((data.get("choices") or [{}])[0].get("message") or {})
             .get("content") or "").strip()
    if not reply:
        raise ValueError("빈 응답")
    hl = (ctx.get("keywords") or []) + (ctx.get("tags") or [])
    return {"reply": reply, "sources": [_source(x, hl) for x in ctx["hits"][:5]],
            "chips": _default_chips(), "mode": "llm", "model": model}


def _llm_answer(question, ctx, cfg):
    provider = cfg.get("provider", "")
    if provider == "ollama":
        return _ollama_answer(question, ctx, _pick_model(cfg))
    if provider == "openai":
        return _openai_answer(question, ctx, cfg)
    raise NotImplementedError(f"LLM provider '{provider}' 미구현")


def answer(question):
    """챗봇 진입점. 검색 컨텍스트를 만든 뒤 (가능하면)LLM, 아니면 규칙기반."""
    question = (question or "").strip()
    ctx = retrieve(question)
    cfg = get_config()
    if cfg.get("provider"):
        try:
            return _llm_answer(question, ctx, cfg)
        except Exception:
            pass  # 연결 전/실패 시 규칙기반으로 자동 폴백
    res = _rule_answer(question, ctx)
    res.setdefault("mode", "rule")
    return res
