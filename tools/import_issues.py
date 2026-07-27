# -*- coding: utf-8 -*-
"""
Z: 서버의 고객사(드림텍/두성테크/한국성전/욱광/엠씨넥스/파트론/파인텍/에스제이아이티)
출하검증 폴더 안 '출하이슈사항' 엑셀을 읽어 프로그램 DB(issue_history /
issue_record) 형식으로 정리한다. 2026-07부터 8개사 전 모델 동기화(필터 없음).

- Z: 서버 파일은 '읽기 전용'으로만 접근 (수정/이동/삭제 금지)
- 고객사별 모델 10개를 랜덤 선정 (내용이 실제로 있는 파일 우선, 모델 중복 제거)
"""
import os, re, sys, json, random, argparse
import openpyxl

# 태그·증상분류 규칙은 앱과 단일 소스 공유 (app/tagging.py)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.tagging import (SYMPTOM_TYPES, TAG_VOCAB,             # noqa: E402
                         classify_category, auto_tags, tags_field)

CUSTOMERS = ["드림텍", "두성테크", "한국성전", "욱광", "엠씨넥스",
             "파트론", "파인텍", "에스제이아이티"]
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


# 모델명 판별 규칙 (2026-07 사용자 확정 — 8개 고객사 전 모델 확장):
#   경로: <고객사>/<카테고리...>/<모델>/[부위...]/<검사기폴더>/<출하검증>/<파일>
#   ① 경로에 '모델형' 세그먼트(SM-*, V코드, 프로젝트 코드)가 있으면 그것이 모델.
#   ② 없으면 검사기 폴더 '바로 위' 폴더가 모델 — 단 SUB/DOME/POGO 같은
#      부위(board) 폴더면 그 위로 올라간다. (한국성전 BUDS4 PRO 등 이름 폴더는
#      폴더명 그대로 / GOODIX·EGIS向·CCP조작계 같은 중간 분류 폴더는 무시)
#   - 부위(board) = 모델과 검사기 사이의 SUB/POGO/MMW/DOME 등 (PBA 구분)
#   - 검사기 종류(tester_type) = 검사기 폴더명("2. 012T2602_기능검사기")에서 정규화
SM_RE = re.compile(r"^(SM[-_]|SGH[-_]|GT[-_]|EO[-_]|EP[-_])", re.I)
VCODE_RE = re.compile(r"^V[A-Z]{2,3}\d{3,4}")                     # VCF0776-0126000, VMA0166 ...
PROJECT_RE = re.compile(r"^(GW\d|WATCH\d|BUDS\d?|TAB\b|Q\d\b)", re.I)  # SM 없는 삼성 프로젝트 코드

# 부위(board) 폴더로 취급하는 이름 — 모델이 아니라 PBA 부위/구성이다 (정규화 후 비교)
BOARD_NAMES = {"SUB", "MAIN", "POGO", "MMW", "FRC", "CTC", "BTOB", "B TO B",
               "BAROMETER", "DOME", "SENSOR", "LOWER", "UPPER", "SPK", "MIC",
               "RCV", "공용부", "기구부"}
BOARD_SUFFIXES = ("연배",)                       # "4연배" 등
# 부위 복합명에 함께 등장하는 보조 토큰 — 단독으로는 부위 판정 근거가 안 된다
BOARD_EXTRA_TOKENS = {"PBA", "IF", "RF", "FPCB", "B", "TO"}

# 카테고리(분류) 폴더 — 모델명이 될 수 없는 이름들. 부위 건너뛰기가 여기까지
# 올라와 버리면 잘못 올라온 것이므로 아래에서 되돌린다.
CATEGORY_NAMES = {"제조", "자동화", "연구소", "PBA", "TSP", "TV", "기타", "설비",
                  "SUB PBA", "가전TSP", "지문센서", "심박센서", "초음파"}
CATEGORY_SUFFIXES = ("년", "向", "향", "社", "사업부", "시리즈")


def _looks_like_model(seg):
    return bool(SM_RE.search(seg) or VCODE_RE.search(seg) or PROJECT_RE.search(seg))


def _norm_seg(seg):
    return re.sub(r"\s+", " ", (seg or "").strip()).upper()


def _is_board_seg(seg):
    """부위(board) 폴더 판정 — 단독 이름(SUB/DOME) 또는 'IF CTC PBA'처럼
       부위 토큰이 포함된 복합 이름(나머지 토큰은 보조 토큰일 때)도 부위로 본다."""
    s = _norm_seg(seg)
    if s in BOARD_NAMES or s.replace(" ", "") in BOARD_NAMES \
            or any(s.endswith(sfx) for sfx in BOARD_SUFFIXES):
        return True
    toks = [t for t in re.split(r"[\s\-_/,.()]+", s) if t]
    if toks and any(t in BOARD_NAMES for t in toks) \
            and all(t in BOARD_NAMES or t in BOARD_EXTRA_TOKENS for t in toks):
        return True                       # 예: "IF CTC PBA", "SUB PBA", "B TO B"
    return False


def _is_category_seg(seg):
    s = _norm_seg(seg)
    return s in CATEGORY_NAMES or bool(re.match(r"^\d+\s*[.\-]", s)) \
        or any(s.endswith(sfx) for sfx in CATEGORY_SUFFIXES)


def _clean_model(name):
    """모델 폴더명 정리 — '7. PPSAW20' 같은 번호 접두를 뗀다(내용이 남을 때만)."""
    s = re.sub(r"^\s*\d{1,3}\s*[.\-]\s*", "", (name or "").strip())
    return s.strip() or (name or "").strip()


def derive_model_tester(path, customer):
    parts = path_parts(path, customer)          # 고객사 이후 세그먼트 (파일 포함)
    # parts[-1]=파일, parts[-2]=출하검증 폴더, parts[-3]=검사기 폴더
    tester_dir = parts[-3] if len(parts) >= 3 else (parts[-2] if len(parts) >= 2 else "")
    cand = parts[:-3] if len(parts) >= 4 else parts[:1]   # 검사기 폴더 위의 세그먼트들
    if not cand:
        cand = [parts[0]] if parts else [""]

    # ① 모델형 세그먼트(SM-*, V코드, 프로젝트 코드) 우선 — 좌측부터 첫 번째
    for i, seg in enumerate(cand):
        if _looks_like_model(seg):
            board = " ".join(s for s in cand[i + 1:] if s).strip() or None
            return _clean_model(seg), board, tester_dir

    # ② 검사기 폴더 바로 위부터 위로 — 부위(board) 폴더는 건너뛴다
    idx = len(cand) - 1
    boards = []
    while idx > 0 and _is_board_seg(cand[idx]):
        boards.insert(0, cand[idx])
        idx -= 1
    # 안전장치: 부위를 건너뛰다 카테고리(제조/PBA/…)까지 올라와 버렸으면,
    # 마지막으로 건너뛴 폴더가 사실 모델이다(모델명에 MIC 등 토큰이 든 경우).
    if boards and _is_category_seg(cand[idx]):
        model_seg = boards.pop(0)
        board = " ".join(boards).strip() or None
        return _clean_model(model_seg), board, tester_dir
    board = " ".join(boards).strip() or None
    return _clean_model(cand[idx]), board, tester_dir


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


# 예전에는 고객사별 모델 필터(드림텍·두성=SM*, 성전=V코드)로 일부만 들여왔으나,
# 2026-07 확정으로 8개 고객사 '전체 모델'을 동기화한다 — 필터 없음.
def collect_all(customer, files=None, failed=None):
    """고객사의 '모든' 출하이슈파일을 전부 정리.
       files 를 주면(서버 동기화) 목록파일 대신 그 경로들을 사용.
       failed 리스트를 주면 읽기 실패(엑셀 열림·네트워크 오류) 경로를 담아준다."""
    if files is None:
        files = load_candidates(customer)
    picked, models = [], set()
    n_total = n_empty = 0
    for p in files:
        if not os.path.isfile(p):
            continue
        n_total += 1
        model, board, tester_dir = derive_model_tester(p, customer)
        if not model:
            continue
        try:
            entries = read_issue_file(p)
        except Exception:
            if failed is not None:
                failed.append(p)      # 열려 있거나 손상 — 기존 DB 데이터를 보존해야 함
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
    print(f"[{customer}] 대상파일 {n_total} · 내용有 {len(picked)} · "
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
SKIP_DIRS = ("DATA", "출하사진", "동영상", "Cal_data", "검사 항목별", "SURGE",
             "OldVersions", "#snapshot")
SKIP_FILE_PREFIX = ("~$", "복사본", "사본", "Copy of", "copy of")


def scan_customer(customer, max_depth=6, progress=None, root_dir=None,
                  verify_dirs=None):
    """고객사 폴더에서 출하이슈사항 파일 경로 목록을 수집(BFS, 깊이 제한).

    verify_dirs 에 리스트를 주면 발견한 '출하검증' 폴더 경로를 (이슈 파일
    유무와 무관하게) 모두 담아준다 — 출하사진 연동용 경로 인덱스(z_verify_index).
    """
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
                if verify_dirs is not None:
                    verify_dirs.append(e.path)
                # 출하검증 폴더 안의 이슈 파일만(비재귀) 확인
                try:
                    for f in os.scandir(e.path):
                        if (f.is_file() and "출하이슈사항" in f.name.replace(" ", "")
                                and f.name.endswith(".xlsx")
                                and not f.name.startswith(SKIP_FILE_PREFIX)):
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


# ---------------------------------------------------------------------------
# 모델 폴더 '이름 변경' 감지 — 서버에서 SM-TEST → SM-TEST2 로 바꾸고 동기화하면
# 자동수집 데이터는 재이관으로 자연히 새 이름을 얻지만, 사용자가 프로그램에서
# 직접 등록한 이슈·검증 세션은 옛 이름에 남아 모델이 둘로 쪼개진다.
# 그래서 스캔 전/후 인덱스를 비교해 이름 변경을 감지하고 옛 이름의 모든
# 데이터(수동 등록 포함)를 새 이름으로 이관한다.
#
# 감지 근거(오판 방지를 위해 강한 근거만 사용):
#  ① 관리코드 — 검사기 폴더명 속 고유 코드("006T2607"). 같은 고객사에서 같은
#     관리코드가 어제는 SM-TEST, 오늘은 SM-TEST2 아래에 있으면 이름 변경이다.
#  ② 내용 일치 — 옛 모델의 출하이슈 원문 절반 이상이 '새로 나타난' 모델의
#     원문과 같으면 이름 변경이다. (둘 다 아니면 감지하지 않음 — 안전 우선)
MGMT_CODE_RE = re.compile(r"\b(\d{2,3}T\d{4})\b")


def _norm_raw(s):
    return re.sub(r"\s+", " ", str(s or "")).strip()


def _index_maps(rows):
    """인덱스 행들 → (고객사별 모델 집합, (고객사,관리코드)→모델 집합)."""
    models, by_code = {}, {}
    for r in rows:
        cust, model = r["customer"], r["model"]
        if not model:
            continue
        models.setdefault(cust, set()).add(model)
        m = MGMT_CODE_RE.search(r.get("tester_dir") or "")
        if m:
            by_code.setdefault((cust, m.group(1)), set()).add(model)
    return models, by_code


def detect_renames(old_rows, new_rows, old_content, new_content):
    """이전 인덱스(old_rows)와 새 스캔(new_rows)을 비교해 이름 변경 목록을 반환.
       반환: [(customer, old_model, new_model, 근거)] / 함께 중복 의심 경고도 반환."""
    old_models, old_code = _index_maps(old_rows)
    new_models, new_code = _index_maps(new_rows)
    renames, warns = {}, []

    # ① 관리코드 매칭
    for (cust, code), olds in old_code.items():
        if len(olds) != 1:
            continue
        old_m = next(iter(olds))
        if old_m in new_models.get(cust, set()):
            continue                                   # 옛 이름이 아직 있음 → 변경 아님
        news = new_code.get((cust, code), set())
        if len(news) == 1:
            new_m = next(iter(news))
            if new_m and new_m != old_m:
                renames[(cust, old_m)] = (new_m, f"관리코드 {code}")

    # ② 내용(출하이슈 원문) 일치 매칭 — 신규로 나타난 모델과 절반 이상 겹칠 때
    for (cust, old_m), old_set in old_content.items():
        if (cust, old_m) in renames or not old_set:
            continue
        if old_m in new_models.get(cust, set()):
            continue
        best, best_ratio = None, 0.0
        for (c2, new_m), new_set in new_content.items():
            if c2 != cust or new_m == old_m or new_m in old_models.get(cust, set()):
                continue                               # 원래 있던 모델로의 병합은 ①만 신뢰
            ratio = len(old_set & new_set) / max(1, len(old_set))
            if ratio > best_ratio:
                best, best_ratio = new_m, ratio
        if best and best_ratio >= 0.5:
            renames[(cust, old_m)] = (best, f"이슈 원문 {int(best_ratio * 100)}% 일치")

    # 같은 (고객사, 관리코드)가 두 모델에 동시에 존재 → 복사 후 방치 의심 경고
    for (cust, code), news in new_code.items():
        if len(news) > 1:
            warns.append(f"{cust}: 관리코드 {code} 가 여러 모델({', '.join(sorted(news))})에 "
                         f"중복 — 옛 폴더가 복사로 남아있는지 확인 필요")
    out = [(cust, old_m, new_m, why) for (cust, old_m), (new_m, why) in renames.items()]
    return out, warns


def apply_renames(renames):
    """감지된 이름 변경을 DB 전체(수동 등록 포함)에 반영하고 감사 로그를 남긴다."""
    if not renames:
        return 0
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sys.path.insert(0, root)
    from app import db
    n = 0
    conn = db.get_conn()
    for cust, old_m, new_m, why in renames:
        for sql, args in (
            ("UPDATE issue_history SET model_name=? WHERE model_name=? AND "
             "(customer=? OR customer IS NULL OR customer='')", (new_m, old_m, cust)),
            ("UPDATE issue_record SET model_name=? WHERE model_name=?", (new_m, old_m)),
            ("UPDATE tester SET model_name=? WHERE model_name=? AND "
             "(customer=? OR customer IS NULL OR customer='')", (new_m, old_m, cust)),
            ("UPDATE model_test_map SET model_name=? WHERE model_name=?", (new_m, old_m)),
        ):
            conn.execute(sql, args)
        conn.execute("INSERT INTO audit_log(action,target,detail) VALUES (?,?,?)",
                     ("모델명 변경 이관", f"{old_m} → {new_m}",
                      f"고객사 {cust} · 근거: {why} · 서버 폴더명 변경 감지"))
        n += 1
    conn.commit()
    conn.close()
    return n


def save_verify_index(rows):
    """스캔에서 발견한 '출하검증' 폴더 → 모델 매핑을 DB에 저장(전체 교체).

    zserver(출하사진 연동)가 이 인덱스로 모델 폴더를 즉시 찾는다 —
    경로 구조가 고객사마다 달라도 스캔 결과 그대로를 쓰므로 인식률 100%."""
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sys.path.insert(0, root)
    from app import db
    conn = db.get_conn()
    conn.execute(
        "CREATE TABLE IF NOT EXISTS z_verify_index ("
        " verify_dir TEXT PRIMARY KEY, customer TEXT, model TEXT, board TEXT,"
        " tester_dir TEXT, tester_type TEXT, has_issue INTEGER DEFAULT 0,"
        " scanned_at TEXT DEFAULT (datetime('now','localtime')))")
    conn.execute("DELETE FROM z_verify_index")
    conn.executemany(
        "INSERT OR REPLACE INTO z_verify_index"
        " (verify_dir, customer, model, board, tester_dir, tester_type, has_issue)"
        " VALUES (?,?,?,?,?,?,?)", rows)
    conn.commit()
    conn.close()
    return len(rows)


def _existing_auto_rows(customer=None):
    """DB의 자동수집 이슈 행들(고객사 필터 가능) — 보존/복원·이름변경 감지용."""
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sys.path.insert(0, root)
    from app import db
    sql = "SELECT * FROM issue_history WHERE note LIKE ?"
    args = [f"%{TAG}%"]
    if customer:
        sql += " AND customer=?"
        args.append(customer)
    try:
        return db.query(sql, args)
    except Exception:
        return []


def _rows_to_result(rows):
    """issue_history 자동수집 행들 → collect_all 결과 형식으로 복원(출처 파일별 묶음).
       엑셀이 열려 있어 못 읽은 파일·통째로 안 보이는 고객사의 기존 데이터를
       재이관 과정에서 잃지 않기 위해 사용한다."""
    by_src = {}
    for r in rows:
        note = r.get("note") or ""
        ms = re.search(r"출처:(.+)$", note)
        src = (ms.group(1).strip() if ms else "") or "(알수없음)"
        mt = re.search(r"검사기:([^·]+)", note)
        tdir = mt.group(1).strip() if mt else (r.get("tester_type") or "")
        key = (r.get("customer"), r.get("model_name"), src)
        g = by_src.setdefault(key, {
            "customer": r.get("customer"), "model": r.get("model_name"),
            "board": r.get("board_type"), "tester_dir": tdir,
            "tester_type": r.get("tester_type") or norm_tester(tdir),
            "path": src, "entries": [],
        })
        g["entries"].append({"date": r.get("issue_date"), "unit": r.get("unit_label") or "",
                             "symptom": r.get("symptom") or "", "action": r.get("action") or "",
                             "raw": r.get("raw_text") or ""})
    return list(by_src.values())


def _load_old_index():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sys.path.insert(0, root)
    from app import db
    try:
        return db.query("SELECT * FROM z_verify_index")
    except Exception:
        return []


def sync_from_server(progress=lambda msg: None, root_dir=None):
    """전체 동기화: 스캔 → 파싱 → 이름변경 감지 → DB 재반영(멱등) + 인덱스 갱신.

    안전장치:
      · 모델 폴더 이름 변경 감지 → 수동 등록 데이터까지 새 이름으로 이관
      · 읽기 실패(엑셀 열림 등) 파일 → 기존 DB 데이터를 복원해 유지(증발 방지)
      · 고객사 폴더가 통째로 안 보이면 → 그 고객사 기존 데이터 유지 + 경고
    """
    base = root_dir or _server_root()
    progress(f"서버 경로 확인: {base}")
    old_index = _load_old_index()                       # 이름변경 감지용(교체 전 스냅샷)
    result, index_dicts, warns = [], [], []
    failed_paths, scanned_customers = [], set()
    for c in CUSTOMERS:
        progress(f"[1/3] {c} 서버 폴더 스캔 중…")
        vdirs = []
        try:
            found = scan_customer(c, progress=progress, root_dir=base, verify_dirs=vdirs)
            scanned_customers.add(c)
        except FileNotFoundError:
            # 고객사 폴더 자체가 안 보임(마운트 안 됨 등) — 기존 데이터 유지
            kept = _rows_to_result(_existing_auto_rows(c))
            if kept:
                result.extend(kept)
                warns.append(f"{c}: 서버 폴더에 접근 불가 — 기존 데이터 "
                             f"{sum(len(k['entries']) for k in kept)}건 유지")
            continue
        if not found:
            kept = _rows_to_result(_existing_auto_rows(c))
            if kept:                                    # 폴더는 있는데 파일이 0개 → 의심
                result.extend(kept)
                warns.append(f"{c}: 이슈 파일이 하나도 안 보임 — 기존 데이터 "
                             f"{sum(len(k['entries']) for k in kept)}건 유지 (서버 확인 필요)")
                scanned_customers.discard(c)            # 이전 경로 인덱스도 보존(사진 유지)
                continue
        issue_dirs = {os.path.dirname(p) for p in found}
        for vd in vdirs:
            # 폴더 경로로 모델 판별 — 파일 자리에 더미를 붙여 동일 규칙 사용
            model, board, tdir = derive_model_tester(os.path.join(vd, "_"), c)
            index_dicts.append({"verify_dir": vd, "customer": c, "model": model,
                                "board": board, "tester_dir": tdir,
                                "tester_type": norm_tester(tdir),
                                "has_issue": 1 if vd in issue_dirs else 0})
        progress(f"[2/3] {c} 이슈파일 {len(found)}개 파싱 중… (전 모델)")
        result.extend(collect_all(c, files=found, failed=failed_paths))

    # 읽기 실패 파일 → 기존 DB에서 복원(전체 재이관에서 증발 방지)
    if failed_paths:
        all_rows = _existing_auto_rows()
        keep_rows = [r for r in all_rows
                     if any(p in (r.get("note") or "") for p in failed_paths)]
        kept = _rows_to_result(keep_rows)
        result.extend(kept)
        warns.append(f"열려 있거나 읽기 실패한 파일 {len(failed_paths)}개 — 기존 데이터 "
                     f"{sum(len(k['entries']) for k in kept)}건 유지")

    # 모델 폴더 이름 변경 감지 (관리코드 + 이슈 원문 일치)
    old_content = {}
    for r in _existing_auto_rows():
        old_content.setdefault((r.get("customer"), r.get("model_name")),
                               set()).add(_norm_raw(r.get("raw_text")))
    new_content = {}
    for m in result:
        s = new_content.setdefault((m["customer"], m["model"]), set())
        for e in m["entries"]:
            s.add(_norm_raw(e["raw"]))
    renames, dup_warns = detect_renames(old_index, index_dicts, old_content, new_content)
    warns.extend(dup_warns)

    progress("[3/3] 데이터베이스 반영 중…")
    commit_to_db(result)
    n_renamed = apply_renames(renames)
    for cust, old_m, new_m, why in renames:
        progress(f"모델명 변경 감지: {old_m} → {new_m} ({cust}, {why}) — 전체 데이터 이관")
    index_rows = [(d["verify_dir"], d["customer"], d["model"], d["board"],
                   d["tester_dir"], d["tester_type"], d["has_issue"]) for d in index_dicts]
    # 스캔에 실패한 고객사의 이전 인덱스는 보존 — 사진 연동이 끊기지 않게 한다
    for r in old_index:
        if r.get("customer") not in scanned_customers:
            index_rows.append((r["verify_dir"], r["customer"], r["model"], r["board"],
                               r["tester_dir"], r["tester_type"], r.get("has_issue") or 0))
    n_idx = save_verify_index(index_rows)
    total = sum(len(x["entries"]) for x in result)
    for w in warns:
        progress(f"⚠ {w}")
    msg = f"완료 — 파일 {len(result)}개, 이슈 {total}건, 경로 인덱스 {n_idx}개 반영"
    if n_renamed:
        msg += f" · 모델명 변경 {n_renamed}건 이관"
    if warns:
        msg += f" · 경고 {len(warns)}건"
    progress(msg)
    return {"files": len(result), "issues": total, "index": n_idx,
            "renames": [(f"{o} → {n2}") for _c, o, n2, _w in renames],
            "warnings": warns}
