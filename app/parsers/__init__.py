"""파서 레지스트리 — 로그 내용 자동 감지 + 모델/검사기 종류별 수동 지정.

기본 동작(AutoParser): 로그 내용을 보고 형식을 자동 판별한다.
  1) TSP 장비 로그      : "*Verify Start" + KEYRAW 배열          → TspParser
  2) KNK 장비 공통 로그 : "Test START." / $$·? 헤더 / $F 색상코드 → KnkEquipParser
     (기능검사기 FUNC · 방수 WP · PROXIMITY · VSWR · LNA)
  3) 그 외              : 기본 CSV 형식                           → GenericCsvParser

특정 모델/검사기 종류에 전용 파서를 강제하려면 REGISTRY 에 등록하면 된다.
  예: REGISTRY["방수:SM-S952 SUB"] = WaterproofParser()
key 형식: "검사기종류:모델명" 또는 "검사기종류" 또는 "모델명"
"""
from app.parsers.base import BaseParser
from app.parsers.generic_csv import GenericCsvParser
from app.parsers.knk_equip import KnkEquipParser
from app.parsers.tsp import TspParser

_CSV = GenericCsvParser()
_EQUIP = KnkEquipParser()
_TSP = TspParser()


class AutoParser(BaseParser):
    name = "auto"

    def sniff(self, text):
        t = text or ""
        if "Verify Start" in t and "KEYRAW" in t:
            return _TSP
        if ("Test START" in t or "$$M" in t or "?M00" in t
                or "$F6" in t or "$F1" in t or "$$L" in t):
            return _EQUIP
        return _CSV

    def parse(self, text):
        parser = self.sniff(text)
        parsed = parser.parse(text)
        parsed.setdefault("parser_name", parser.name)
        return parsed


_DEFAULT = AutoParser()

REGISTRY = {}


def get_parser(tester_type=None, model_name=None):
    for key in (f"{tester_type}:{model_name}", tester_type, model_name):
        if key and key in REGISTRY:
            return REGISTRY[key]
    return _DEFAULT


def available_parsers():
    names = {_DEFAULT.name, _CSV.name, _EQUIP.name, _TSP.name}
    names.update(p.name for p in REGISTRY.values())
    return sorted(names)
