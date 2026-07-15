"""기본(샘플) 파서 — KNK PASS DATA CSV 형식.

형식 (헤더 필수):
    SECTION,ITEM,VALUE,SPEC_LOW,SPEC_HIGH,REPEAT_INDEX
  - SECTION = MEAS  : 단일 측정 (REPEAT_INDEX 비움)
  - SECTION = REPEAT: 반복성 측정 (REPEAT_INDEX = 회차)
  - SPEC_LOW/HIGH 비우면 judge_spec 기본 규격 사용
'#' 로 시작하는 줄은 주석.
"""
import csv
import io
from app.parsers.base import BaseParser


def _num(s):
    s = (s or "").strip()
    if s == "":
        return None
    try:
        f = float(s)
        return int(f) if f.is_integer() else f
    except ValueError:
        return None


class GenericCsvParser(BaseParser):
    name = "generic_csv"

    def parse(self, text):
        measurements = []
        # 주석 줄 제거
        lines = [ln for ln in text.splitlines() if not ln.lstrip().startswith("#")]
        reader = csv.DictReader(io.StringIO("\n".join(lines)))
        for row in reader:
            row = { (k or "").strip().upper(): (v or "").strip() for k, v in row.items() }
            item = row.get("ITEM")
            if not item:
                continue
            val = _num(row.get("VALUE"))
            if val is None:
                continue
            section = (row.get("SECTION") or "MEAS").upper()
            rep = _num(row.get("REPEAT_INDEX")) if section == "REPEAT" else None
            measurements.append({
                "item": item,
                "value": val,
                "spec_low": _num(row.get("SPEC_LOW")),
                "spec_high": _num(row.get("SPEC_HIGH")),
                "repeat_index": rep,
            })
        return {"measurements": measurements}
