"""
KNK TinyUK3 DataLogger protocol parser.

Wire format (see FW/Common/KNK/DataLogger.h):

    '$' + Type + <fixed-width payload> + XOR(2 hex ASCII) + CR + LF

'$' is the terminal colour-escape prefix, so a literal '$' reaches the log
doubled ("$$"). The checksum is computed over the *single* '$', the type byte
and the payload -- everything except the two checksum characters themselves.

Colour codes ($F1, $FF, $FS, $FR, ...) are interleaved with the data records
and are stripped before parsing.

Two blocks are emitted per test run:

    $S ... data records ... $E      live measurement stream
    $@ ... V records ...    $&      final summary (payload padded to 43)
"""

import re
from dataclasses import dataclass, field

# ---------------------------------------------------------------------------
# payload widths, from the packed structs in DataLogger.h
# ---------------------------------------------------------------------------
W_MODEL = 30    # PModel_t     : Value[30]
W_DATA = 30    # PData_t      : Caption[15] '=' Value[14]
W_V = 43    # PDataV_t     : union padded to PDataV3_t
W_GROUP = 44    # PGroup_t     : Caption[40] '=' Value[3]
W_STR = 46    # PDataStr_t   : Caption[15] '=' Value[30]
W_SPEC = 63    # PDataSpec_t  : Caption[15] '(' Min[15] '~' Max[15] ')' '=' Value[14]
W_LONG = 82    # PLongSpec_t  : ... '=' Value[30] ':' Result[2]

COLOUR_CODE = re.compile(r"\$F[0-9A-Fa-f]|\$F[SRD]|\$B[0-9A-Fa-f]|\*CLS")

# Record type bytes the firmware actually emits. Anything else starting with
# "$$" is a mangled colour code in a display line, not data.
RECORD_TYPES = set("SEXG@&NMPCVRDTIBL")


def strip_colour(text):
    """Remove $Fx terminal colour codes, leaving data records intact."""
    return COLOUR_CODE.sub("", text)


def xor_checksum(body):
    """XOR of every byte in `body`, as the FW computes it."""
    acc = 0
    for ch in body.encode("cp949", errors="replace"):
        acc ^= ch
    return acc


@dataclass
class Record:
    type: str                  # single-char record type
    caption: str = ""
    value: str = ""
    spec_min: str = ""
    spec_max: str = ""
    result: str = ""           # 'OK' / 'NG' / 'SKIP' / 'NONE'
    ok_count: str = ""
    total_count: str = ""
    checksum_ok: bool = True
    repaired: bool = False     # 전송 오류로 깨진 것을 체크섬으로 복구했음
    raw: str = ""


@dataclass
class TestRun:
    """One complete $S..$E + $@..$& cycle."""
    complete: bool = False     # $& (또는 $E) 까지 정상 종료된 사이클인가
    equip_no: str = ""
    model: str = ""
    process: str = ""
    prod_code: str = ""
    version: str = ""
    result: str = ""
    tact_time: str = ""
    measurements: list = field(default_factory=list)  # Record, from the live stream
    summary: list = field(default_factory=list)       # Record, from the $D lines

    @property
    def is_ng(self):
        return self.result.strip().upper() == "NG"


def _split(payload, *widths):
    """Cut `payload` into consecutive fixed-width slices."""
    out, pos = [], 0
    for w in widths:
        out.append(payload[pos:pos + w])
        pos += w
    return out


def parse_record(line):
    """Parse one '$$X....' line into a Record, or return None.

    시리얼 선로에서 1비트가 튀어 '$$R...' 이 '$ R...'(0x24→0x20) 처럼
    깨져 들어오는 일이 있다. 그대로 두면 그 측정값 한 개가 조용히 사라지므로,
    앞 두 글자만 깨진 경우에 한해 원래 모양으로 되돌려 본 뒤
    **레코드 자체의 XOR 체크섬이 맞을 때만** 받아들인다(값이 깨진 줄은 걸러진다).
    """
    if not line.startswith("$$"):
        return _repair_record(line)
    if len(line) < 5 or line[2] not in RECORD_TYPES:
        return None
    return _parse_body(line)


def looks_like_record(line):
    """데이터 레코드 줄인가 — 앞머리 '$$' 가 깨진 줄까지 포함해서 판단.

    실시간 수신 쪽에서 '$$' 로 시작하는지만 보고 걸러내면, 전송 오류로
    '$ R...' 처럼 깨진 줄이 복구되기도 전에 버려진다.
    """
    return (len(line) >= 5 and line[2:3] in RECORD_TYPES
            and (line.startswith("$$") or "$" in line[:2]))


def _repair_record(line):
    """앞머리 '$$' 가 깨진 줄을 체크섬 검증 후 복구한다."""
    if len(line) < 5 or line[2] not in RECORD_TYPES:
        return None
    if "$" not in line[:2]:          # 최소한 한 글자는 '$' 로 남아 있어야 함
        return None
    rec = _parse_body("$$" + line[2:])
    if rec is None or not rec.checksum_ok:
        return None                  # 체크섬 불일치 → 값이 깨진 줄. 쓰지 않는다
    rec.repaired = True
    rec.raw = line
    return rec


def _parse_body(line):
    body = line[1:]           # drop the escape '$', leaving '$' + Type + payload + chk
    payload = body[2:-2]
    given = body[-2:]

    rec = Record(type=body[1], raw=line)
    try:
        want = int(given, 16)
        # How much of the trailing space padding is folded into the XOR varies
        # by firmware generation (CDataLogger::Initialize IsNew). Since the
        # padding is all 0x20, that only ever flips one bit of the checksum, so
        # accept either parity -- the real data is still fully covered.
        trimmed = xor_checksum(body[:-2].rstrip())
        rec.checksum_ok = want in (xor_checksum(body[:-2]),
                                   trimmed, trimmed ^ 0x20)
    except ValueError:
        rec.checksum_ok = False

    t, n = rec.type, len(payload)

    if t == "D" or (t in "@&CNMPVR" and n == W_V):
        # summary block: payload padded to 43
        if t == "D":
            head = payload[:W_V]
            rec.caption = head[:25].strip()
            rest = head[26:]                     # skip '='
            rec.result = rest[:4].strip()
            rec.ok_count = rest[5:10].strip()
            rec.total_count = rest[11:16].strip()
        else:
            rec.value = payload[:25].strip()
        return rec

    if n == W_LONG:                              # $L : group verdict with spec
        cap, _, mn, _, mx, _, _, val, _, res = _split(
            payload, 15, 1, 15, 1, 15, 1, 1, 30, 1, 2)
        rec.caption, rec.spec_min, rec.spec_max = cap.strip(), mn.strip(), mx.strip()
        rec.value, rec.result = val.strip(), res.strip()
        return rec

    if n == W_SPEC:                              # $I / $R / $B : measurement with spec
        cap, _, mn, _, mx, _, _, val = _split(payload, 15, 1, 15, 1, 15, 1, 1, 14)
        rec.caption, rec.spec_min, rec.spec_max = cap.strip(), mn.strip(), mx.strip()
        rec.value = val.strip()
        return rec

    if n == W_STR:                               # $T : text value
        rec.caption, rec.value = payload[:15].strip(), payload[16:].strip()
        return rec

    if n == W_GROUP:                             # $G : group NG count
        rec.caption, rec.value = payload[:40].strip(), payload[41:].strip()
        return rec

    if n in (W_DATA, W_MODEL):
        if len(payload) > 15 and payload[15] == "=":   # PData_t
            rec.caption, rec.value = payload[:15].strip(), payload[16:].strip()
        else:                                          # PModel_t
            rec.value = payload.strip()
        return rec

    rec.value = payload.strip()
    return rec


# ---------------------------------------------------------------------------
# '?' 프레이밍 (신형 검사기) — DataLogger.h 의 '$' 계열과 완전히 별개 포맷.
#     '?' + Type + '00' + payload + <공백> + XOR(2 hex)
#   ?@00START  사이클 시작(= $S)      ?&00END  사이클 완결(= $&)
#   ?N 호기 · ?M 모델 · ?P 공정 · ?V 버전 · ?G 그룹판정 · ?R 측정값 · ?! 시각 · ?I 정보
# ?R 앞줄의 'min max value' 원문(가끔 '0?00 …' 처럼 한 글자 깨져 들어옴)은
# 바로 뒤 ?R 레코드에 같은 값이 다시 오므로 무시한다.
# ---------------------------------------------------------------------------
_QMARK = re.compile(r"^\?([A-Za-z@&!])\d\d(.*)$")
_Q_CHK = re.compile(r"^(.*?)\s*[0-9A-Fa-f]{2}\s*$")        # 끝 2자리 = XOR 체크섬
_Q_GROUP = re.compile(
    r"^(?P<name>.+?)\(\s*(?P<ok>\d+)\s*/\s*(?P<tot>\d+)\s*\)=(?P<detail>.*)$")
_Q_MEAS = re.compile(
    r"^(?P<name>.+?)\(\s*(?P<lo>-?[\d.]+)\s*/\s*(?P<hi>-?[\d.]+)\s*\)=(?P<valchk>.*)$")


def _q_value(rest):
    """?N/?M/?P/?V 헤더 값 — 끝의 2자리 체크섬(공백 구분 가능)을 떼어낸다."""
    m = _Q_CHK.match(rest)
    return (m.group(1) if m else rest).strip().strip("=").strip()


def _q_group(rest):
    """?G00<이름>(<합격>/<전체>)=<불량상세><chk> → 그룹 판정 레코드.

    합격<전체 면 불량. '=' 뒤는 OK 면 체크섬뿐(값 '0'),
    NG 면 'F:...불량상세...' + 체크섬 → $$L 과 같이 불량상세를 값으로 남긴다.
    """
    m = _Q_GROUP.match(rest)
    if m is None:
        return None
    ok, tot = m.group("ok"), m.group("tot")
    passed = ok == tot
    detail = m.group("detail").strip()
    val = "0" if passed else (detail[:-2].strip() if len(detail) > 2 else detail)
    return Record(type="G", caption=m.group("name").strip(), value=val,
                  ok_count=ok, total_count=tot, result="OK" if passed else "NG")


def _q_meas(rest):
    """?R00<이름>(<min>/<max>)=<값><chk> → 측정 레코드(끝 2자리는 체크섬)."""
    m = _Q_MEAS.match(rest)
    if m is None:
        return None
    valchk = m.group("valchk").strip()
    value = valchk[:-2].strip() if len(valchk) > 2 else valchk
    lo, hi = m.group("lo"), m.group("hi")
    res = ""
    try:                                    # 스펙 범위 판정(숫자가 아니면 판정 보류)
        res = "OK" if float(lo) <= float(value) <= float(hi) else "NG"
    except ValueError:
        res = ""
    return Record(type="R", caption=m.group("name").strip(),
                  spec_min=lo, spec_max=hi, value=value, result=res)


def parse_stream(text, complete_only=True, stats=None):
    """Parse a whole log / capture into a list of TestRun.

    complete_only=True (기본) 면 **검사가 끝까지 진행된 사이클만** 돌려준다.
    PBA 데이터로거와 같은 규칙 — Test START 만 있고 중간에 검사를 중단해
    $&(요약) 도 $E(스트림 끝) 도 오지 않은 회차는 결과로 세지 않는다.
    stats 에 dict 을 주면 {'aborted','repaired'} 개수를 담아 준다.
    """
    runs, cur, in_summary = [], None, False
    aborted = repaired = 0

    def close(run):
        nonlocal aborted
        if run is None:
            return
        if run.complete or not complete_only:
            runs.append(run)
        else:
            aborted += 1                    # 중단된 회차 — 데이터로거에 넣지 않는다

    for line in strip_colour(text).splitlines():
        line = line.rstrip("\r\n")

        qm = _QMARK.match(line)             # 신형 '?' 프로토콜 레코드
        if qm is not None:
            t, rest = qm.group(1), qm.group(2)
            if t == "@":                    # ?@00START — 사이클 시작
                close(cur)
                cur = TestRun()
                in_summary = False
            elif cur is None:
                pass                        # START 전 잡음은 버림
            elif t == "&":                  # ?&00END — 사이클 완결
                if not cur.result:          # ?G/?R 중 하나라도 불량이면 회차 NG
                    cur.result = "NG" if any(
                        r.result == "NG" for r in cur.measurements) else "OK"
                cur.complete = True
                runs.append(cur)
                cur, in_summary = None, False
            elif t == "N" and not cur.equip_no:
                cur.equip_no = _q_value(rest)
            elif t == "M" and not cur.model:
                cur.model = _q_value(rest)
            elif t == "P" and not cur.process:
                cur.process = _q_value(rest)
            elif t == "V" and not cur.version:
                cur.version = _q_value(rest)
            elif t == "G":                  # 그룹 판정 → 데이터로거 항목
                g = _q_group(rest)
                if g is not None:
                    cur.measurements.append(g)
            elif t == "R":                  # 개별 측정값 → 데이터로거 항목
                r = _q_meas(rest)
                if r is not None:
                    cur.measurements.append(r)
            continue

        rec = parse_record(line)
        if rec is None:
            continue
        if rec.repaired:
            repaired += 1

        t = rec.type

        if t == "S":                        # live stream begins
            close(cur)                      # 이전 사이클 마무리(미완결이면 버림)
            cur = TestRun()
            in_summary = False
            continue

        if cur is None:
            continue

        if t == "@":                        # summary block begins
            in_summary = True
            continue

        if t == "&":                        # summary block ends -> run complete
            cur.complete = True
            runs.append(cur)
            cur, in_summary = None, False
            continue

        if t == "E" and not in_summary:     # live stream ends
            # 요약 블록($@..$&)을 보내지 않는 장비(STERI 700 등)는 여기가 끝이다
            cur.complete = True
            continue

        if in_summary:
            if t == "N":
                cur.equip_no = rec.value
            elif t == "M":
                cur.model = rec.value
            elif t == "P":
                cur.process = rec.value
            elif t == "C":
                cur.prod_code = rec.value
            elif t == "V":
                cur.version = rec.value
            elif t == "R":
                cur.result = rec.value
            elif t == "D":
                cur.summary.append(rec)
        else:
            if t == "N" and not cur.equip_no:
                cur.equip_no = rec.value
            elif t == "M" and not cur.model:
                cur.model = rec.value
            elif t == "P" and not cur.process:
                cur.process = rec.value
            elif t == "R" and rec.caption.upper().startswith("TACT"):
                cur.tact_time = rec.value
            elif t == "T" and rec.caption.upper() == "RESULT":
                # verdict from the live stream; a $@..$& block overrides later
                cur.result = rec.value
            elif t in "IRBTL":
                cur.measurements.append(rec)

    close(cur)              # 마지막 사이클 — 중단된 상태면 버려진다

    if stats is not None:
        stats["aborted"] = stats.get("aborted", 0) + aborted
        stats["repaired"] = stats.get("repaired", 0) + repaired
    return runs


CSV_COLUMNS = [
    "run", "equip_no", "model", "process", "prod_code", "version",
    "run_result", "tact_time", "kind", "caption", "spec_min", "spec_max",
    "value", "result", "ok_count", "total_count", "checksum_ok",
]


def run_to_rows(run, index):
    """Flatten a TestRun into CSV-ready rows."""
    base = [index, run.equip_no, run.model, run.process, run.prod_code,
            run.version, run.result, run.tact_time]
    rows = []
    for r in run.measurements:
        rows.append(base + ["measure", r.caption, r.spec_min, r.spec_max,
                            r.value, r.result, "", "", r.checksum_ok])
    for r in run.summary:
        rows.append(base + ["summary", r.caption, "", "", "",
                            r.result, r.ok_count, r.total_count, r.checksum_ok])
    return rows
