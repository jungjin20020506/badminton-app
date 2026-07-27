# -*- coding: utf-8 -*-
"""
KNK RAG(검색 증강 생성) 엔진 — app/rag.py

■ 한 줄 요약
   "AI에게 우리 회사 지식을 가르치고(=지식베이스에 쌓고), 질문이 오면 그 지식 중
    의미가 가장 비슷한 것을 찾아 AI에게 근거로 주고 답하게 만드는" 모듈.

■ AI 담당자가 말한 용어와의 대응
   - RAG                = 이 모듈 전체 흐름(검색 → 근거주입 → 생성)
   - Embedding model    = OpenAI text-embedding-3-small (문장을 숫자벡터로 바꿈)
   - Vector DB          = SQLite의 knowledge 테이블(벡터를 저장) + 파이썬 코사인 검색
   - langchain          = 위 흐름을 대신 엮어주는 "선택적" 프레임워크. 설치가 필요해
                          이 프로그램(무설치·전 PC 배포)에는 맞지 않아, 같은 일을
                          표준 라이브러리(urllib)만으로 직접 구현했다. 결과는 동일하다.

■ 의존성 0 — openai/langchain/chromadb/numpy 설치가 전혀 필요 없다.
   OpenAI 임베딩 API는 chatbot.py 와 똑같이 urllib 로 호출하고, 벡터는 JSON 문자열로
   knowledge 테이블에 저장하며, 유사도(코사인)는 순수 파이썬으로 계산한다.
"""
import json
import math
import os
import re
import urllib.request
from app import db

EMBED_MODEL = "text-embedding-3-small"   # 저렴·고성능. 1536차원 → dimensions로 512 축소
EMBED_DIM = 512                          # 저장/속도 절약(품질 저하 거의 없음)
EMBED_ENDPOINT = "https://api.openai.com/v1/embeddings"

# 지식 1건 최대 길이. 이보다 길면 문단 단위로 잘라 여러 청크로 저장(검색 정확도↑)
MAX_CHUNK = 1100
SEARCH_MIN_SCORE = 0.15                  # 이보다 유사도 낮으면 근거로 안 씀(노이즈 방지)


# --------------------------------------------------------------------------- 키/설정
def _cfg():
    from app import chatbot
    return chatbot.get_config()


def _api_key(cfg=None):
    cfg = cfg or _cfg()
    key = (cfg.get("api_key") or "").strip()
    if not key:
        raise ValueError("OpenAI API 키가 없습니다. (AI 도우미 화면에서 키 저장, 또는 "
                         "app/openai_key.txt 동봉)")
    return key


def available(cfg=None):
    """임베딩(RAG)이 가능한 상태인지 — OpenAI 키가 있으면 True."""
    try:
        _api_key(cfg)
        return True
    except Exception:
        return False


# --------------------------------------------------------------------------- 임베딩
def _normalize(vec):
    """벡터를 단위길이로 정규화 → 이후 코사인유사도 = 단순 내적(dot)."""
    n = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [x / n for x in vec]


def embed_batch(texts, cfg=None):
    """여러 문장을 한 번에 임베딩(정규화된 벡터 리스트 반환). OpenAI 호출."""
    cfg = cfg or _cfg()
    key = _api_key(cfg)
    texts = [(t or " ")[:8000] for t in texts]      # 과금·길이 보호
    payload = {"model": EMBED_MODEL, "input": texts, "dimensions": EMBED_DIM}
    req = urllib.request.Request(
        EMBED_ENDPOINT,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json",
                 "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.loads(r.read().decode("utf-8"))
    items = sorted(data.get("data", []), key=lambda d: d.get("index", 0))
    return [_normalize(it["embedding"]) for it in items]


def embed_one(text, cfg=None):
    return embed_batch([text], cfg=cfg)[0]


# --------------------------------------------------------------------------- 지식 쌓기(학습)
def _chunk(text):
    """긴 글은 빈 줄(문단) 기준으로 MAX_CHUNK 이하 조각으로 나눈다."""
    text = (text or "").strip()
    if len(text) <= MAX_CHUNK:
        return [text] if text else []
    parts, buf = [], ""
    for para in re.split(r"\n\s*\n", text):
        para = para.strip()
        if not para:
            continue
        if len(buf) + len(para) + 2 > MAX_CHUNK and buf:
            parts.append(buf.strip())
            buf = ""
        buf += para + "\n\n"
        while len(buf) > MAX_CHUNK:                 # 한 문단이 통째로 너무 길면 강제 분할
            parts.append(buf[:MAX_CHUNK].strip())
            buf = buf[MAX_CHUNK:]
    if buf.strip():
        parts.append(buf.strip())
    return parts


def add_knowledge(content, source="전문가입력", topic="", by="", cfg=None):
    """지식을 임베딩해서 knowledge 테이블에 저장. 저장된 청크 개수를 반환.

    임베딩(OpenAI 키)이 안 되면 벡터 없이 원문만 저장하고(embedding=NULL),
    나중에 reindex()로 한꺼번에 색인할 수 있다 → 키 없이도 데이터는 안 잃는다.
    """
    chunks = _chunk(content)
    if not chunks:
        return 0
    vecs = None
    if available(cfg):
        try:
            vecs = embed_batch(chunks, cfg=cfg)
        except Exception:
            vecs = None
    for i, ch in enumerate(chunks):
        emb = json.dumps(vecs[i]) if vecs else None
        db.execute(
            "INSERT INTO knowledge(content,source,topic,embedding,embed_model,created_by) "
            "VALUES (?,?,?,?,?,?)",
            (ch, source, topic or None, emb, EMBED_MODEL if vecs else None, by or None))
    return len(chunks)


def reindex(cfg=None, limit=200):
    """임베딩이 없는(embedding IS NULL) 지식을 찾아 한꺼번에 벡터 색인.
       키를 나중에 넣었거나, 다른 PC에서 텍스트만 쌓인 경우 복구용."""
    rows = db.query("SELECT id, content FROM knowledge WHERE embedding IS NULL LIMIT ?",
                    (limit,))
    if not rows:
        return {"indexed": 0, "remaining": 0}
    vecs = embed_batch([r["content"] for r in rows], cfg=cfg)
    for r, v in zip(rows, vecs):
        db.execute("UPDATE knowledge SET embedding=?, embed_model=? WHERE id=?",
                   (json.dumps(v), EMBED_MODEL, r["id"]))
    remaining = db.query("SELECT COUNT(*) c FROM knowledge WHERE embedding IS NULL",
                         one=True)["c"]
    return {"indexed": len(rows), "remaining": remaining}


def delete_knowledge(kid):
    db.execute("DELETE FROM knowledge WHERE id=?", (int(kid),))
    return {"ok": True}


# --------------------------------------------------------------------------- 벡터 검색
def _dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def search(query, k=5, cfg=None):
    """질문과 의미가 가까운 지식 top-k 반환. 각 항목에 유사도 score 포함.
       (RAG의 'Retrieval' 단계 — 임베딩 실패/미색인 시 빈 리스트로 안전 폴백)"""
    query = (query or "").strip()
    if not query:
        return []
    rows = db.query("SELECT id, content, source, topic, embedding FROM knowledge "
                    "WHERE embedding IS NOT NULL")
    if not rows:
        return []
    try:
        qv = embed_one(query, cfg=cfg)
    except Exception:
        return []
    scored = []
    for r in rows:
        try:
            vec = json.loads(r["embedding"])
        except Exception:
            continue
        s = _dot(qv, vec)                     # 둘 다 정규화돼 있어 내적 = 코사인유사도
        if s >= SEARCH_MIN_SCORE:
            scored.append((s, r))
    scored.sort(key=lambda x: x[0], reverse=True)
    out = []
    for s, r in scored[:k]:
        out.append({"id": r["id"], "content": r["content"], "source": r["source"],
                    "topic": r["topic"], "score": round(s, 3)})
    return out


def context_block(hits):
    """검색된 지식을 LLM 프롬프트에 넣을 근거 텍스트로 포맷."""
    if not hits:
        return ""
    lines = []
    for i, h in enumerate(hits, 1):
        tp = f"[{h['topic']}] " if h.get("topic") else ""
        lines.append(f"{i}) {tp}{h['content'].strip()}")
    return "\n".join(lines)


# --------------------------------------------------------------------------- 통계
def stats():
    total = db.query("SELECT COUNT(*) c FROM knowledge", one=True)["c"]
    indexed = db.query("SELECT COUNT(*) c FROM knowledge WHERE embedding IS NOT NULL",
                       one=True)["c"]
    topics = db.query(
        "SELECT topic, COUNT(*) c FROM knowledge WHERE topic IS NOT NULL "
        "GROUP BY topic ORDER BY c DESC LIMIT 12")
    return {"total": total, "indexed": indexed, "unindexed": total - indexed,
            "topics": topics, "available": available()}


def list_knowledge(limit=100, topic=None):
    if topic:
        rows = db.query("SELECT id,content,source,topic,embedding,created_at FROM knowledge "
                        "WHERE topic=? ORDER BY id DESC LIMIT ?", (topic, limit))
    else:
        rows = db.query("SELECT id,content,source,topic,embedding,created_at FROM knowledge "
                        "ORDER BY id DESC LIMIT ?", (limit,))
    for r in rows:
        r["indexed"] = bool(r.pop("embedding", None))
    return rows


# --------------------------------------------------------------------------- AI 인터뷰(학습 가속)
# 질문 생성은 답변 채팅(gpt-4o-mini)보다 좋은 모델을 쓴다 — 한 번에 짧은 질문
# 하나라 비용이 매우 작고, 질문 품질이 지식베이스 품질을 좌우하기 때문.
# 실패(권한 없음 등)하면 설정된 기본 모델로 자동 재시도한다.
INTERVIEW_MODEL = os.environ.get("KNK_INTERVIEW_MODEL", "gpt-4o")

_INTERVIEW_SYS = (
    "당신은 KNK(케이엔케이) 품질팀의 지식을 수집하는 인터뷰어입니다. 상대는 검사기(테스터)와 "
    "품질 업무를 아주 잘 아는 사내 전문가입니다. 목표는 'KNK 검사기와 품질의 모든 것'을 담은 "
    "지식베이스를 짧은 시간에 채우는 것입니다.\n"
    "KNK는 전자부품(PBA·FPCB·TSP 등) 검사기를 제작·출하검증하는 회사입니다. 검사기 종류: "
    "기능검사기(Open/Short), 방수, VSWR, LNA, 고주파(TDR/IL), 돔하중, 조도, 지문센서, TSP.\n"
    "질문 규칙:\n"
    "1) 이미 수집된 내용(아래 목록)은 다시 묻지 말고, 비어 있는 부분을 채우는 질문을 하세요.\n"
    "2) 반드시 위 실제 업무 범위 안에서, 실무자가 겪는 '구체적 상황'을 물으세요. "
    "추상적·철학적·일반론 질문(품질이란 무엇인가 등)은 금지합니다.\n"
    "3) 좋은 질문의 '형태' 예(그대로 베끼지 말고 형태만 참고): '~검사에서 값이 스펙에 걸칠 때 "
    "재측정 기준이 있나요?', '~부품은 언제/어떤 기준으로 교체하나요?', '~불량이 반복되면 어느 팀과 "
    "어떻게 협의하나요?'\n"
    "4) 나쁜 질문 예: '품질 관리에서 가장 중요한 것은?', '검사란 무엇이라고 생각하시나요?' (금지)\n"
    "5) 처음에는 넓게(검사기 종류·검사 방식·판정 기준), 지식이 쌓일수록 점점 더 구체적으로 "
    "좁혀가세요. 한 질문은 '하나의 사실/기준/절차'만 물어야 합니다.\n"
    "6) 한 번에 '딱 하나'의 질문만, 한국어로, 전문가가 말로 대답하기 쉬운 형태로 하세요.\n"
    "7) 질문만 출력하세요(번호·설명·머리말 없이 질문 문장 하나)."
)

# 지식이 거의 없을 때 던질 기본(seed) 질문 — API 없이도 인터뷰 시작 가능
_SEED_QUESTIONS = [
    "KNK에서 다루는 검사기(테스터) 종류에는 어떤 것들이 있고, 각각 무엇을 검사하나요?",
    "기능검사기의 출하검사는 어떤 순서와 방식으로 진행되나요?",
    "방수(WP) 검사는 어떤 원리로 하고, 합격/불량 판정 기준은 무엇인가요?",
    "VSWR·LNA 같은 RF 검사에서 가장 자주 보는 불량과 그 원인은 무엇인가요?",
    "'가성불량(오검출)'은 어떤 경우에 생기고, 진짜 불량과 어떻게 구분하나요?",
    "핀블록·컨텍(포고핀) 관련해서 검출력 문제가 날 때 어디를 먼저 점검하나요?",
    "고객사(드림텍·두성테크·한국성전)별로 검사 기준이나 특이사항에 차이가 있나요?",
    "출하 전 반드시 확인하는 핵심 체크포인트 3가지만 꼽는다면 무엇인가요?",
]


# 최근 낸 인터뷰 질문(중복 방지) — 서버 프로세스 살아있는 동안 최대 12개 기억
_RECENT_Q = []


def _recent_questions():
    return list(_RECENT_Q)


def _remember_question(q):
    if q and q not in _RECENT_Q:
        _RECENT_Q.append(q)
        del _RECENT_Q[:-12]


def _known_summary(limit=40):
    rows = db.query("SELECT content, topic FROM knowledge ORDER BY id DESC LIMIT ?", (limit,))
    if not rows:
        return ""
    lines = []
    for r in rows:
        tp = f"[{r['topic']}] " if r.get("topic") else ""
        lines.append("- " + tp + re.sub(r"\s+", " ", r["content"]).strip()[:80])
    return "\n".join(lines)


def interview_question(cfg=None):
    """전문가에게 던질 '다음 질문'을 생성. 지식이 쌓일수록 더 깊은 질문으로 좁혀간다.
       OpenAI가 안 되면 seed 질문 중 아직 다루지 않은 것을 고른다."""
    cfg = cfg or _cfg()
    known = _known_summary()
    n = db.query("SELECT COUNT(*) c FROM knowledge", one=True)["c"]

    if available(cfg):
        from app import chatbot
        recent = _recent_questions()
        avoid = ("\n최근에 이미 했던 질문(다시 하지 말 것):\n"
                 + "\n".join(f"- {q}" for q in recent) + "\n") if recent else ""
        user = (f"지금까지 수집된 지식({n}건) 요약:\n{known or '(아직 없음 — 가장 기초부터 시작)'}\n"
                f"{avoid}\n"
                "위를 참고해, 아직 비어 있는 가장 중요한 부분을 채울 새로운 질문 '하나'만 해주세요.")
        msgs = [{"role": "system", "content": _INTERVIEW_SYS},
                {"role": "user", "content": user}]
        # 좋은 모델 우선 → 실패 시 기본 모델 → 그래도 실패면 seed 질문
        for model in (INTERVIEW_MODEL, None):
            try:
                reply = chatbot.openai_chat(msgs, cfg=cfg, temperature=0.8, model=model)
                q = (reply or "").strip().strip('"').split("\n")[0].strip()
                if q:
                    _remember_question(q)
                    return {"question": q, "known": n, "mode": "ai"}
            except Exception:
                continue
    # 폴백: 아직 안 쓴 seed 질문
    idx = min(n, len(_SEED_QUESTIONS) - 1)
    return {"question": _SEED_QUESTIONS[idx], "known": n, "mode": "seed"}


# --------------------------------------------------------------------------- Q&A → 지식화(정리해서 쌓기)
_DISTILL_SYS = (
    "다음 질문과 답변을, 나중에 검색해 재사용할 수 있도록 '사실 지식' 형태로 간결히 정리하세요. "
    "군더더기·인사말·불확실한 표현은 빼고, 핵심 사실/절차/기준만 3~6문장으로 한국어로 쓰세요. "
    "정리된 지식 본문만 출력하세요."
)


def teach_from_qa(question, answer_text, topic="", by="", cfg=None):
    """좋은 질문/답변을 '정리'해서 지식베이스에 저장(임베딩 포함).
       GPT로 요약 정리 → 실패하면 Q/A 원문을 그대로 저장한다."""
    cfg = cfg or _cfg()
    distilled = ""
    if available(cfg):
        try:
            from app import chatbot
            distilled = chatbot.openai_chat(
                [{"role": "system", "content": _DISTILL_SYS},
                 {"role": "user", "content": f"[질문]\n{question}\n\n[답변]\n{answer_text}"}],
                cfg=cfg, temperature=0.2)
        except Exception:
            distilled = ""
    content = (distilled or "").strip() or f"Q. {question}\nA. {answer_text}"
    added = add_knowledge(content, source="Q&A", topic=topic, by=by, cfg=cfg)
    return {"added": added, "content": content}
