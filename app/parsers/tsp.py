"""TSP(터치키) 검사기 로그 파서.

로그 구조 (실 로그 샘플: app/parsers/samples/real/)
  - `*Verify Start*****  Count : N` 블록이 측정 회수만큼 반복
  - 블록 헤더 <SYSTEM> 에 MODEL => ...;
  - 그룹별 데이터:
      KEYRAW(IDX)=>,키이름1,키이름2,...    ← 키(채널) 이름 목록
      KEYRAW(MIN)=> / KEYRAW(MAX)=>        ← 키별 규격 하한/상한 배열
      KEYRAW=>, 값1, 값2, ...              ← 키별 실측값 배열
    KEYDELTA 그룹도 동일 구조
  - <RESULT> 블록: TEST RESULT = OK/NG;
"""
import re

from app.parsers.base import BaseParser

_VERIFY_SPLIT = re.compile(r"\*Verify Start\**")
_NUM = re.compile(r"-?\d+(?:\.\d+)?")
_GROUPS = ("KEYRAW", "KEYDELTA")


def _names(block, group):
    m = re.search(re.escape(group) + r"\(IDX\)=>", block)
    if not m:
        return []
    line = block[m.end():].splitlines()[0]
    return [s.strip() for s in line.split(",") if s.strip()]


def _nums_after(block, pattern, expected):
    """마커 다음에 나오는 숫자 expected개를 수집."""
    m = re.search(pattern, block, re.M)
    if not m:
        return []
    out = []
    for tok in _NUM.findall(block[m.end():]):
        out.append(float(tok))
        if len(out) >= expected:
            break
    return [int(v) if v.is_integer() else v for v in out]


#: 이 회수 이상 Verify Start 블록이 반복되면 반복성(시료별) 측정으로 간주
REPEAT_MIN_BLOCKS = 10


class TspParser(BaseParser):
    name = "tsp"

    def parse(self, text):
        chunks = _VERIFY_SPLIT.split(text or "")
        blocks = [c for c in chunks[1:]] if len(chunks) > 1 else [text or ""]
        is_repeat = len(blocks) >= REPEAT_MIN_BLOCKS

        meta = {"model": None, "unit_no": None, "program": "TSP",
                "blocks": len(blocks), "test_items": [], "warnings": []}
        measurements = []
        result_agg = {}  # group → {ok, ng}

        for bi, block in enumerate(blocks, start=1):
            rep = bi if is_repeat else None
            if not meta["model"]:
                m = re.search(r"MODEL\s*=>\s*([^;\n]+);", block)
                if m:
                    meta["model"] = m.group(1).strip()

            for group in _GROUPS:
                names = _names(block, group)
                if not names:
                    continue
                n = len(names)
                mins = _nums_after(block, re.escape(group) + r"\(MIN\)=>", n)
                maxs = _nums_after(block, re.escape(group) + r"\(MAX\)=>", n)
                vals = _nums_after(block, r"^\s*" + re.escape(group) + r"=>,?", n)
                for i, name in enumerate(names):
                    if i >= len(vals):
                        break
                    measurements.append({
                        "item": f"{group} {name}",
                        "value": vals[i],
                        "spec_low": mins[i] if i < len(mins) else None,
                        "spec_high": maxs[i] if i < len(maxs) else None,
                        "repeat_index": rep,
                    })

            # 블록별 항목 결과 (## KEYRAW : OK / <RESULT> 안의 KEYTOUCH = OK; 등)
            for m in re.finditer(r"##\s*(\S[^:]*?)\s*:\s*(OK|NG)", block):
                name, res = m.group(1).strip(), m.group(2)
                agg = result_agg.setdefault(name, {"name": name, "ok": 0, "ng": 0,
                                                   "passed": 0, "total": 0})
                agg["ok" if res == "OK" else "ng"] += 1
                agg["total"] += 1
                if res == "OK":
                    agg["passed"] += 1

        meta["test_items"] = sorted(result_agg.values(), key=lambda a: (-a["ng"], a["name"]))
        return {"measurements": measurements, "meta": meta, "parser_name": self.name}
