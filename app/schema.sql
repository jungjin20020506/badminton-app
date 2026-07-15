-- ===================================================================================
-- KNK 검사기 출하검증 자동화 프로그램 — SQLite 스키마
-- 명세서 섹션 3 데이터 모델 기반. 세 기능(검증/문서/AI)이 공유하는 단일 DB.
-- ===================================================================================

-- 3.1 tester — 검사기(호기) 마스터
CREATE TABLE IF NOT EXISTS tester (
    tester_id            INTEGER PRIMARY KEY AUTOINCREMENT,
    model_name           TEXT NOT NULL,
    model_rev            TEXT,
    tester_type          TEXT NOT NULL,        -- 기능검사기 / 방수 / VSWR / LNA / PROXIMITY / 지문 / TSP
    unit_no              INTEGER,              -- 호기 번호 (1,2,3 …)
    board_type           TEXT,
    made_date            TEXT,
    legal_transfer_date  TEXT,
    verify_mode          TEXT,                 -- 신규 / MODIFY / 양산
    status               TEXT DEFAULT '검증중', -- 검증중 / 출하완료
    customer             TEXT,                 -- 고객사 (드림텍 등)
    created_at           TEXT DEFAULT (datetime('now','localtime'))
);

-- 3.2 flow_step — 출하 검사 순서도 단계 (22단계 마스터, 전 검증 공용)
CREATE TABLE IF NOT EXISTS flow_step (
    step_no               INTEGER PRIMARY KEY,
    title                 TEXT NOT NULL,       -- 공정명
    action                TEXT,                -- 조치사항
    description           TEXT,                -- 부연설명
    model_specific_notes  TEXT                 -- 모델별 안내(런타임에 issue_history와 병합)
);

-- 검사 항목 템플릿 (최종 check Sheet 기준, 검증 세션 생성 시 check_item으로 복제)
CREATE TABLE IF NOT EXISTS check_item_template (
    tmpl_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    seq          INTEGER,
    category     TEXT,                          -- 본사 / 법인 / 시스템설정
    item_name    TEXT NOT NULL,
    test_desc    TEXT,
    criteria     TEXT,
    customer     TEXT                           -- 특정 고객사 전용 항목(예: 드림텍 NG STOP). NULL이면 공통
);

-- 측정 항목 기본 규격 (판정 기준값, 섹션 5.1)
CREATE TABLE IF NOT EXISTS judge_spec (
    item        TEXT PRIMARY KEY,              -- Open / Short / DIFF ...
    spec_low    REAL,
    spec_high   REAL,
    normal      REAL,                          -- 정상 고정값(있으면)
    unit        TEXT,
    margin_pct  REAL DEFAULT 0.05,             -- 경계(주의) 판정 여유율
    note        TEXT
);

-- 3.3 inspection_run — 한 번의 검증 세션
CREATE TABLE IF NOT EXISTS inspection_run (
    run_id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tester_id         INTEGER REFERENCES tester(tester_id),
    inspector         TEXT,
    run_date          TEXT DEFAULT (datetime('now','localtime')),
    verify_mode       TEXT,                    -- 신규 / MODIFY / 양산
    result            TEXT DEFAULT '진행중',    -- PASS / FAIL / 진행중
    inspector_comment TEXT
);

-- 3.4 check_item — 검사 항목 결과 (세션별)
CREATE TABLE IF NOT EXISTS check_item (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id     INTEGER REFERENCES inspection_run(run_id),
    seq        INTEGER,
    category   TEXT,
    item_name  TEXT,
    test_desc  TEXT,
    criteria   TEXT,
    result     TEXT DEFAULT '미검사'            -- PASS / FAIL / 미검사
);

-- 3.5 measurement — 로그에서 파싱한 실측 데이터
CREATE TABLE IF NOT EXISTS measurement (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id       INTEGER REFERENCES inspection_run(run_id),
    item         TEXT,                          -- Open / Short / DIFF ...
    value        REAL,
    spec_low     REAL,
    spec_high    REAL,
    judge        TEXT,                          -- 정상 / 주의 / 알림
    repeat_index INTEGER                        -- 반복성 회차(1~40), 단일측정은 NULL
);

-- 3.6 photo — 검증 사진
CREATE TABLE IF NOT EXISTS photo (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id     INTEGER REFERENCES inspection_run(run_id),
    photo_type TEXT,
    file_path  TEXT
);

-- 3.7 issue_history — 과거 이슈 데이터 (검사 전 안내 & AS 챗봇 근거)
CREATE TABLE IF NOT EXISTS issue_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    model_name  TEXT,
    tester_type TEXT,
    item        TEXT,
    symptom     TEXT,
    action      TEXT,
    note        TEXT
);

-- ===================================================================================
-- 3단계(AI 지원) 준비 — 검수자 의견 구조화 & 참고자료 색인
-- 원문은 그대로 보존하고, 검색용 분류 칸(component/symptom_type)을 별도로 둔다.
-- ===================================================================================

-- 부품 분류 표준 목록 (검수자 의견 입력 시 드롭다운)
CREATE TABLE IF NOT EXISTS component_type (
    name       TEXT PRIMARY KEY,
    sort_order INTEGER
);

-- 증상 분류 표준 목록 (검수자 의견 입력 시 드롭다운)
CREATE TABLE IF NOT EXISTS symptom_type (
    name       TEXT PRIMARY KEY,
    sort_order INTEGER
);

-- 모델 ↔ 검사기 종류 매핑 (어떤 모델이 어떤 검사를 받는지, N:M)
CREATE TABLE IF NOT EXISTS model_test_map (
    model_name  TEXT NOT NULL,
    tester_type TEXT NOT NULL,
    PRIMARY KEY (model_name, tester_type)
);

-- 검수자 의견 (구조화) — 원문 보존 + 부품/증상 분류 + AI 요약(3단계 연동 시 채움)
CREATE TABLE IF NOT EXISTS issue_record (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id      INTEGER REFERENCES inspection_run(run_id),
    model_name  TEXT,
    tester_type TEXT,
    component   TEXT REFERENCES component_type(name),
    symptom_type TEXT REFERENCES symptom_type(name),
    raw_text    TEXT NOT NULL,
    summary     TEXT,
    action      TEXT,
    inspector   TEXT,
    created_at  TEXT DEFAULT (datetime('now','localtime'))
);

-- 참고자료 색인 (메뉴얼/사진 등 파일은 파일서버에 두고, 검색용 텍스트+경로만 저장)
CREATE TABLE IF NOT EXISTS reference_doc (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    category    TEXT,
    customer    TEXT,
    title       TEXT,
    description TEXT,
    file_path   TEXT
);
