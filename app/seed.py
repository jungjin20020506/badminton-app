"""초기 데이터 시딩 — 명세서 섹션 5의 실제 값 그대로.
검사기 종류: 기능검사기 / 방수 / VSWR / LNA / PROXIMITY / 지문 / TSP
"""

# 검사기 종류 (섹션 요청)
TESTER_TYPES = ["기능검사기", "방수", "VSWR", "LNA", "PROXIMITY", "지문", "TSP"]

# 검증 모드
VERIFY_MODES = ["신규", "MODIFY", "양산"]

# 부품 분류 표준 목록 (검수자 의견 입력 시 드롭다운, AI 자동추출 시 표준화 기준)
COMPONENT_TYPES = [
    "마이크", "스피커", "핀블록", "카메라", "보드", "케이블",
    "커넥터", "센서", "소프트웨어", "기타",
]

# 증상 분류·태그 표준 목록 — 단일 소스(app/tagging.py)에서 가져옴.
from app.tagging import SYMPTOM_TYPES, TAG_VOCAB  # noqa: F401,E402

# 검증 사진 종류 (섹션 5.4)
PHOTO_TYPES = [
    "검사기 사진", "LOG DATA(LCD)", "EOS Surge", "인주TEST", "검사기 마킹",
    "내부사진", "외관사진", "파형 캡쳐", "10MΩ 검출력 검증",
]

# ---------------------------------------------------------------------------
# 5.2 출하 검사 순서도 22단계  (step_no, title, action, description)


# ---------------------------------------------------------------------------
# 5.1 판정 기준값 (measurement 기본 규격)
#   item, spec_low, spec_high, normal, unit, margin_pct, note
# ---------------------------------------------------------------------------
JUDGE_SPECS = [
    ("Open",  0, 150000, 15000, "",  0.05, "정상값 15000 고정, 범위 0<X<150000"),
    ("Short", 0, 10,     None,  "",  0.10, "0<X<10"),
    ("DIFF",  0, 40,     None,  "",  0.10, "방수 DIFF 예시 규격(모델별 상이)"),
    ("공압",   0.5, 0.6,  None,  "Mpa", 0.05, "0.5~0.6 Mpa"),
    ("누설전압", 0, 1.0,  None,  "V(AC)", 0.10, "AC 1V 이하"),
    ("EOS_Surge", 0, 10, None,  "%", 0.10, "인가전압 대비 10% 미만"),
]

# ---------------------------------------------------------------------------
# 5.3 최종 check Sheet 검사 항목 (템플릿)
#   seq, category, item_name, test_desc, criteria, customer
# ---------------------------------------------------------------------------
# 통합 검증 체크리스트 22단계 (순서도 + 체크시트 병합, 2026-07 개정)
#   기존에는 '순서도 22단계'(절차)와 '체크시트 23항목'(PASS/FAIL)이 따로 있어
#   중복 확인이 발생했다. 실제 검사 순서대로 하나로 합치고,
#   프로그램이 자동으로 하는 단계(DATA 분석·사진 촬영·성적서 작성·업로드·검수완료)는 제외했다.
#   각 항목: (순번, 구분, 항목명, 절차/조치 힌트, 판정 기준, 고객사전용)
# ---------------------------------------------------------------------------
CHECK_ITEMS = [
    (1,  "외관·기본", "검사기 각인 확인", "검사기 모델명 오기입 여부 확인", "모델명과 동일할 것", None),
    (2,  "외관·기본", "검사기 외관 확인", "외관 파손·볼트 체결·실린더 상태 확인", "외관상 특이사항 없을 것", None),
    (3,  "외관·기본", "검사기 내부 확인", "내부 이물질·보드·케이블 손상 확인", "이물 및 보드·케이블 손상 없을 것", None),
    (4,  "전원·공압", "전원 인가상태 검사", "전원 인가 후 이상 유무 확인", "전원인가 문제 없을 것", None),
    (5,  "전원·공압", "공압 인가상태 검사", "레귤레이터 압력 확인", "0.5~0.6 Mpa 범위로 셋팅", None),
    (6,  "동작", "스위치 동작상태 검사", "각 스위치·Re-Turn 동작 확인", "각 스위치 동작·Re-Turn 이상 없을 것", None),
    (7,  "동작", "버큠 동작상태 검사", "버큠 On/Off 동작 확인", "버큠 정상동작 할 것", None),
    (8,  "동작", "Buzzer/Display/LED 검사", "부저·표시부·LED 동작 확인", "Buzzer/Display/LED 정상동작", None),
    (9,  "동작", "안전센서 검사", "안전센서 차단·복귀 동작 확인", "안전센서 동작 이상 없을 것", None),
    (10, "전기안전", "누설전압 검사", "안착부·외함 누설전압 측정", "AC 1V 이하일 것", None),
    (11, "전기안전", "EOS Surge 검사", "전원 T.P 오실로스코프 연결 후 점검", "인가전압 대비 10% 미만 or 최대내압 이내", None),
    (12, "FW·통신", "F/W·PATTERN Version 확인",
         "FW·PATTERN 다운로드 후 버전 확인 / 실패 시: CPU Format · USB 교체·재결합 · 메인보드 확인",
         "기준 버전과 동일할 것", None),
    (13, "FW·통신", "시리얼 통신·USB 인식 확인",
         "USB 인식 및 시리얼 통신 확인 / 이상 시: 통신 칩·시리얼 케이블 상태 확인",
         "통신·USB 인식 정상일 것", None),
    (14, "FW·통신", "보드·케이블·컨텍 상태 확인",
         "젠더보드(점퍼)·옵션보드·I2C 케이블·PCB 조립·컨텍 상태 확인 / Sol 순서 확인",
         "보드·케이블·컨텍 이상 없을 것", None),
    (15, "기구·안착", "제품 테이블 검사",
         "제품 테이블·최종 도면 대조, 간섭부 확인·수정",
         "들뜸/끼임/기움/부품간섭 없을 것", None),
    (16, "기구·안착", "핀블록·핀 규격·간섭 확인",
         "핀블록 컨텍·스토퍼 높이·사용 핀 규격·기구 간섭 확인",
         "핀 규격 및 컨텍 상태 정상일 것", None),
    (17, "기구·안착", "안착상태 검사", "시료 안착 후 검사 완료 시 상태 확인", "제품 이탈/상판 부착 없을 것", None),
    (18, "기구·안착", "제품 데미지 검사", "기구물에 인주 묻혀 간섭 확인", "부품에 인주가 묻지 않을 것", None),
    (19, "기능 Set up", "Marking 검사",
         "마킹 Sol·오토 진공 등 기능별 Set up 후 마킹 위치/지워짐 확인",
         "마킹 이상 없을 것", None),
    (20, "검사 SPEC", "검사항목·SPEC 확인", "검사항목 SKIP·SPEC 오기입 확인 (VSWR/MIC cal 포함)",
         "전기적특성 기준과 동일할 것", None),
    (21, "검출력", "양품 Master Sample 검사", "일상점검용 양품시료로 검사 동작 확인", "각 항목 SPEC IN 및 PASS", None),
    (22, "검출력", "불량 Master Sample 검출력 검사", "일상점검용 불량시료 검출력 확인", "각 항목 불량 검출할 것", None),
    # ── 해당 모델/고객사에만 적용되는 조건부 항목 (기본 접힘)
    (23, "조건부", "NG STOP 상태 확인", "불량 발생 시 검사 STOP 확인", "다음 검사항목 진행되지 않을 것", "드림텍"),
    (24, "조건부", "O/S 전핀 검사 확인", "커넥터 OPEN/SHORT 전핀 검사 확인", "전기적특성 기준과 동일할 것", None),
    (25, "조건부", "압착 면적 확인", "제품·본드 배치 영역 간섭 확인", "조립도·본드 배치 간섭 없을 것", None),
    (26, "조건부", "MIC RUBBER 확인", "MIC RUBBER 적용 유/무 확인", "MIC RUBBER(음샘) 적용되어 있을 것", None),
]

# 순서도(flow_step)는 위 체크리스트와 동일한 22단계를 사용한다(챗봇 "순서" 답변 일치용).
FLOW_STEPS = [(seq, name, desc, crit) for seq, cat, name, desc, crit, cust in CHECK_ITEMS
              if cat != "조건부"]


# ---------------------------------------------------------------------------
# 3.7 issue_history — 과거 이슈
#   ※ 예전에는 데모용 더미(SM-S952/SM-S711 등)를 넣었으나, 실제 출하이슈가
#     서버에서 대량 이관되면서 혼동을 유발해 제거함. 실데이터는 tools/import_issues.py 로 적재.
# ---------------------------------------------------------------------------
ISSUE_HISTORY = []

# 더미 검사기(호기)/측정 데이터도 실데이터 이관 이후 불필요하여 제거함.
DUMMY_TESTERS = []
DUMMY_UNIT_DIFF = {}


def seed_all(conn):
    conn.executemany(
        "INSERT INTO flow_step(step_no,title,action,description) VALUES (?,?,?,?)",
        FLOW_STEPS,
    )
    conn.executemany(
        "INSERT INTO judge_spec(item,spec_low,spec_high,normal,unit,margin_pct,note) VALUES (?,?,?,?,?,?,?)",
        JUDGE_SPECS,
    )
    conn.executemany(
        "INSERT INTO check_item_template(seq,category,item_name,test_desc,criteria,customer) VALUES (?,?,?,?,?,?)",
        CHECK_ITEMS,
    )
    conn.executemany(
        "INSERT INTO issue_history(model_name,tester_type,item,symptom,action,note) VALUES (?,?,?,?,?,?)",
        ISSUE_HISTORY,
    )
    conn.executemany(
        "INSERT INTO component_type(name,sort_order) VALUES (?,?)",
        [(name, i) for i, name in enumerate(COMPONENT_TYPES)],
    )
    conn.executemany(
        "INSERT INTO symptom_type(name,sort_order) VALUES (?,?)",
        [(name, i) for i, name in enumerate(SYMPTOM_TYPES)],
    )

    # 더미 검사기 + 과거 검증 세션 + 측정값
    for t in DUMMY_TESTERS:
        cur = conn.execute(
            "INSERT INTO tester(model_name,model_rev,tester_type,unit_no,board_type,customer,verify_mode,status) "
            "VALUES (?,?,?,?,?,?,?,?)", t,
        )
        tester_id = cur.lastrowid
        unit_no = t[3]
        if t[2] == "방수" and unit_no in DUMMY_UNIT_DIFF:
            run_cur = conn.execute(
                "INSERT INTO inspection_run(tester_id,inspector,verify_mode,result,inspector_comment) "
                "VALUES (?,?,?,?,?)",
                (tester_id, "이전검사자", t[6], "PASS",
                 f"{unit_no}호기 방수 DIFF 대표값 {DUMMY_UNIT_DIFF[unit_no]} 기록."),
            )
            run_id = run_cur.lastrowid
            conn.execute(
                "INSERT INTO measurement(run_id,item,value,spec_low,spec_high,judge,repeat_index) "
                "VALUES (?,?,?,?,?,?,?)",
                (run_id, "DIFF", DUMMY_UNIT_DIFF[unit_no], 0, 40, "정상", None),
            )
