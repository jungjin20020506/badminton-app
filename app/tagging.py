# -*- coding: utf-8 -*-
"""태그·증상분류 규칙 — 단일 소스.

출하이슈 원문 2,003건 실측 빈도로 도출한 규칙을 앱(api/chatbot)과
임포터(tools/import_issues.py)가 함께 사용한다.
이슈 작성 화면의 '태그 자동 추천'도 이 규칙(auto_tags)을 쓴다.
"""
import re

# ---------------------------------------------------------------------------
# 증상 주 분류 10종 (+비결함 버킷) — 우선순위 순서대로 첫 매칭이 주 분류가 된다.
# ---------------------------------------------------------------------------
DEFECT_RULES = [
    ("마이크·음샘",             r"음샘|마이크|\bmic\b"),
    ("OS·통신·저장",            r"\bOS\b|O/S|통신|저장\s*(기능|안|불가|안됨|안되)|datalogger|데이터로거|ID\s*CHECK|id\s*check|부팅|booting"),
    ("FW·펌웨어·다운로드",       r"\bFW\b|fw|펌웨어|펌웨|다운\s*로드|다운로드"),
    ("마킹",                   r"마킹|마커|marking"),
    ("RF·파형·전류(VSWR/서지)",  r"파형|전류|전압|서지|surge|VSWR|vswr|임피던스|이득|검파|저항\s*값"),
    ("크랙·파손·눌림",          r"크랙|크렉|파손|깨|찍힘|눌림|눌러|찢|스크래치|긁"),
    ("커넥터·케이블·보드(PCB)",   r"커넥터|connector|케이블|cable|클립|clip|c-clip|역삽|보드|\bPCB\b|pcb|기판|점퍼|이어\s*잭|ear\s*jack"),
    ("가성불량(오검출)",         r"가성|오검출|가검출|검출\s*안|반복성.*(흔들|편차|튐)"),
    ("핀블록·컨텍 검출력",       r"핀\s*블록|핀블럭|컨텍|컨택|검출력|pogo|POGO|포고|프로브|접촉|핀\s*(교체|변경|추가)"),
    ("기구·안착·간섭",          r"푸셔|플로팅|실린더|\bsol\b|SOL|진공|안착|간섭|도피|가이드|기구|테이블|젠더|스토퍼|낌|들뜸|딸려"),
]
_DEFECT_COMPILED = [(name, re.compile(pat)) for name, pat in DEFECT_RULES]
_NOISSUE_RE = re.compile(r"특이\s*사항\s*없|이상\s*없|문제\s*없|특이\s*없|양호")
_CHANGE_RE = re.compile(r"modify|MODIFY|미입고|시료\s*변경|버전\s*변경|검사\s*추가|매칭\s*상태")

SYMPTOM_TYPES = [name for name, _ in DEFECT_RULES] + [
    "특이사항 없음(정상출하)", "MODIFY·시료변경 등", "기타",
]


def classify_category(raw):
    """원문 → 증상 주 분류 1개."""
    t = raw or ""
    for name, rx in _DEFECT_COMPILED:
        if rx.search(t):
            return name
    if _NOISSUE_RE.search(t):
        return "특이사항 없음(정상출하)"
    if _CHANGE_RE.search(t):
        return "MODIFY·시료변경 등"
    return "기타"


# ---------------------------------------------------------------------------
# 다중 태그 20종 — 한 이슈에 여러 개 부착. 원문 실측 빈도 상위 원자 키워드.
# ---------------------------------------------------------------------------
TAG_RULES = [
    ("가성불량",     r"가성|오검출|가검출"),
    ("핀블록",       r"핀\s*블록|핀블럭"),
    ("메인보드/PCB", r"보드|\bPCB\b|pcb|기판|\bPBA\b|pba|회로"),
    ("컨텍/접촉",    r"컨텍|컨택|접촉"),
    ("FW",          r"\bFW\b|fw|펌웨어|펌웨"),
    ("마킹",         r"마킹|마커"),
    ("파형/전류",    r"파형|전류|전압|이득|검파|서지|surge|VSWR|vswr|임피던스"),
    ("간섭",         r"간섭|낌|들뜸|딸려"),
    ("테이블",       r"테이블"),
    ("푸셔",         r"푸셔"),
    ("마이크",       r"음샘|마이크|\bmic\b"),
    ("안착",         r"안착"),
    ("반복성",       r"반복성"),
    ("크랙/파손",    r"크랙|크렉|파손|깨|찍힘|눌림|찢|스크래치"),
    ("센서",         r"센서|sensor|근조도|조도|proximity|\bhall\b|HALL"),
    ("검출력",       r"검출력"),
    ("OS/통신",      r"\bOS\b|O/S|통신|저장\s*(기능|안|불가)|부팅|datalogger|데이터로거"),
    ("젠더",         r"젠더"),
    ("커넥터",       r"커넥터|connector|클립|clip|c-clip|역삽"),
    ("케이블",       r"케이블|cable|이어\s*잭|ear\s*jack"),
]
_TAG_COMPILED = [(name, re.compile(pat)) for name, pat in TAG_RULES]
TAG_VOCAB = [name for name, _ in TAG_RULES]


def auto_tags(raw):
    """원문 → 매칭되는 모든 태그 리스트(다중). 이슈 작성 화면의 자동 추천에 사용."""
    t = raw or ""
    return [name for name, rx in _TAG_COMPILED if rx.search(t)]


def tags_field(tag_list):
    """검색 편의: 앞뒤 콤마로 감싼 문자열(정확 매칭 LIKE '%,태그,%')."""
    return "," + ",".join(tag_list) + "," if tag_list else ""


# 이슈 '상태' 표준값 — 원문 분석: 개선완료 표현 28%, 추후/모니터링 14%가 실제로 쓰임.
STATUS_OPTIONS = ["개선완료", "임시조치·모니터링", "미해결·추후확인", "정보공유"]


def assemble_raw(sample_rev="", symptom="", cause="", action="", status=""):
    """구조화 입력 → 챗봇/목록용 원문 조립(기존 자유형 데이터와 같은 검색 경로를 탄다)."""
    lines = []
    if sample_rev:
        lines.append(f"시료: {sample_rev}")
    if symptom:
        lines.append(f"증상: {symptom}")
    if cause:
        lines.append(f"원인: {cause}")
    if action:
        lines.append(f"조치: {action}")
    if status:
        lines.append(f"상태: {status}")
    return "\n".join(lines)
