"""파서 레지스트리 — 모델/검사기 종류별 파서 선택.

현재는 모든 모델이 기본 GenericCsvParser 를 사용한다.
새 포맷이 확정되면 아래 REGISTRY 에 (매칭조건 → 파서)를 추가하면 된다.
예: REGISTRY["방수:SM-S952 SUB"] = WaterproofParser()
"""
from app.parsers.generic_csv import GenericCsvParser

_DEFAULT = GenericCsvParser()

# key 형식: "검사기종류:모델명" 또는 "검사기종류" 또는 "모델명"
REGISTRY = {}


def get_parser(tester_type=None, model_name=None):
    for key in (f"{tester_type}:{model_name}", tester_type, model_name):
        if key and key in REGISTRY:
            return REGISTRY[key]
    return _DEFAULT


def available_parsers():
    names = {_DEFAULT.name}
    names.update(p.name for p in REGISTRY.values())
    return sorted(names)
