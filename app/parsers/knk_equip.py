"""KNK 검사기 실제 장비 로그 파서.

기능검사기(FUNC) · 방수(WP) · PROXIMITY(PROX) · VSWR · LNA 장비가 시리얼로 출력하는
로그를 파싱한다. (실 로그 샘플: app/parsers/samples/real/)

로그 구조
  - 색상 제어코드 `$F?` 가 섞여 있음 → 먼저 제거
  - 헤더: `$$N<호기>` `$$M<모델>` `$$P<프로그램>` (구형) 또는 `?N00..` `?M00..` `?P00..` (신형)
  - 측정 라인(제거 후): `[항목명:타입] 하한<측정값<상한`
  - 보조 측정 라인: `$$R항목명(하한 ~ 상한)=측정값+체크섬2자` (LNA 등 bracket 라인이 없는 항목)
    `$$I...` 도 동일 구조 (방수 압력값)
  - 항목 결과 라인: `- 항목명 : OK (n / m)` / `- 항목명 : NG (x / m)`
  - 반복 측정 로그는 `---- Test START.` 블록이 측정 회수만큼 반복됨
"""
import re

from app.parsers.base import BaseParser

_COLOR = re.compile(r"\$F[0-9A-Z]")           # $F6, $F1, $FF, $FR, $FS, $FD, $FE, $F4, $F9 ...
_TEST_START = re.compile(r"-{4,}\s*Test START\.")
_SEC_SUFFIX = re.compile(r"\s*\[[\d.]+\s*Sec\]\s*$")
_MEAS_BRACKET = re.compile(
    r"^\[(?P<body>.+)\]\s*(?P<low>-?[\d.]+)\s*<\s*(?P<val>-?[\d.]+)\s*<\s*(?P<high>-?[\d.]+)\s*$")
_MEAS_DOLLAR = re.compile(
    r"^\$\$[RI](?P<name>.{1,16}?)\(\s*(?P<low>-?[\d.]+)\s*~\s*(?P<high>-?[\d.]+)\s*\)="
    r"\s*(?P<valchk>-?[\d.]+[0-9A-Fa-f]{2})\s*$")
_ITEM_RESULT = re.compile(
    r"^-\s*(?P<name>.+?)\s*:\s*(?P<res>OK|NG)\s*\(\s*(?P<passed>\d+)\s*/\s*(?P<total>\d+)\s*\)\s*$")


def _num(s):
    try:
        f = float(s)
        return int(f) if f.is_integer() else f
    except (TypeError, ValueError):
        return None


def _clean_name(s):
    return re.sub(r"\s+", " ", (s or "")).strip()


def _header_value(line, prefix):
    """'$$N23   6B' / '?M00SM_S956_SUB 61' 류에서 값 추출 (끝의 체크섬 토큰 제거)."""
    body = line[len(prefix):].strip()
    tokens = body.split()
    if len(tokens) >= 2:
        tokens = tokens[:-1]  # 마지막 토큰은 체크섬
    return " ".join(tokens).strip("= ")


#: 이 회수 이상 Test START 블록이 반복되면 반복성(repeatability) 측정으로 간주.
#: 검출력 확인은 안착·탈착 각 1회(2~4블록), 반복성 측정은 10~50회 (명세 5.1)
REPEAT_MIN_BLOCKS = 10


class KnkEquipParser(BaseParser):
    name = "knk_equip"

    def parse(self, text):
        chunks = _TEST_START.split(text or "")
        # Test START 이전 프리앰블(장비 부팅 메시지 등)은 측정이 없으므로 버림
        blocks = chunks[1:] if len(chunks) > 1 else chunks
        is_repeat = len(blocks) >= REPEAT_MIN_BLOCKS

        meta = {"model": None, "unit_no": None, "program": None,
                "blocks": len(blocks), "test_items": [], "warnings": []}
        measurements = []
        item_agg = {}   # name → {ok, ng, passed, total}

        for bi, block in enumerate(blocks, start=1):
            rep = bi if is_repeat else None
            seen = set()  # (name, low, high, value) — bracket/$$R 중복 제거
            for raw in block.splitlines():
                raw = raw.strip()
                if not raw:
                    continue
                # 장비 자체 합부 표시: 라인 앞 색상코드 $F6=합격(녹색), $F1=불합격(적색)
                dev = "NG" if raw.startswith("$F1") else ("OK" if raw.startswith("$F6") else None)
                line = _COLOR.sub("", raw).strip()
                if not line:
                    continue

                if line.startswith("$$N") and meta["unit_no"] is None:
                    meta["unit_no"] = _num(_header_value(line, "$$N"))
                    continue
                if line.startswith("?N00") and meta["unit_no"] is None:
                    meta["unit_no"] = _num(_header_value(line, "?N00"))
                    continue
                if line.startswith("$$M") and not meta["model"]:
                    meta["model"] = _header_value(line, "$$M")
                    continue
                if line.startswith("?M00") and not meta["model"]:
                    meta["model"] = _header_value(line, "?M00")
                    continue
                if line.startswith("$$P") and not meta["program"]:
                    meta["program"] = _header_value(line, "$$P")
                    continue
                if line.startswith("?P00") and not meta["program"]:
                    meta["program"] = _header_value(line, "?P00")
                    continue

                m = _MEAS_DOLLAR.match(line)
                if m:
                    name = _clean_name(m.group("name"))
                    low, high = _num(m.group("low")), _num(m.group("high"))
                    val = _num(m.group("valchk")[:-2])  # 끝 2자는 체크섬
                    key = (name, low, high, val)
                    if name and val is not None and key not in seen:
                        seen.add(key)
                        measurements.append({"item": name, "value": val, "spec_low": low,
                                             "spec_high": high, "repeat_index": rep,
                                             "device_judge": None})
                    continue

                line2 = _SEC_SUFFIX.sub("", line)
                m = _MEAS_BRACKET.match(line2)
                if m:
                    body = m.group("body")
                    name = _clean_name(body.rsplit(":", 1)[0])  # 타입(R100/MATRX 등)은 뒤에 붙음
                    low, high = _num(m.group("low")), _num(m.group("high"))
                    val = _num(m.group("val"))
                    key = (name, low, high, val)
                    if name and val is not None and key not in seen:
                        seen.add(key)
                        measurements.append({"item": name, "value": val, "spec_low": low,
                                             "spec_high": high, "repeat_index": rep,
                                             "device_judge": dev})
                    continue

                m = _ITEM_RESULT.match(line2)
                if m:
                    name = _clean_name(m.group("name"))
                    agg = item_agg.setdefault(name, {"name": name, "ok": 0, "ng": 0,
                                                     "passed": 0, "total": 0})
                    if m.group("res") == "OK":
                        agg["ok"] += 1
                    else:
                        agg["ng"] += 1
                    agg["passed"] += int(m.group("passed"))
                    agg["total"] += int(m.group("total"))

        meta["test_items"] = sorted(item_agg.values(), key=lambda a: (-a["ng"], a["name"]))
        return {"measurements": measurements, "meta": meta, "parser_name": self.name}
