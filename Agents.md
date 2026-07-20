# Agents.md — KNK 검사기 출하검증 시스템 개발 안내서

> AI 어시스턴트(Claude 등)와 개발자를 위한 프로젝트 구조·작업 가이드입니다.
> **규칙: 사용자가 "문서정리 해줘" 라고 하면 이 파일을 현재 코드 기준으로 최신화합니다.**
> (마지막 정리: 2026-07-16)

## 프로젝트 개요
케이엔케이(KNK) 품질팀용 검사기(테스터) 출하검증 로컬 프로그램.
Python 표준 라이브러리(http.server + sqlite3)만으로 동작하며(엑셀 출력만 openpyxl 필요),
프론트엔드는 빌드 없는 순수 HTML/CSS/JS.

- 실행: `python run.py` 또는 `실행하기.bat` (포트 사용 중이면 자동으로 다음 포트)
- 데이터: `data/quality.db` (SQLite, 런타임 생성) · 검증 사진 `data/photos/`
- 초보자 안내: `실행가이드.md` / 기능 개요: `README.md`

## 폴더/파일 경로 안내 (작업별)

### 실행·배포
| 경로 | 설명 |
|---|---|
| `run.py` | 실행 진입점. 포트 자동 폴백(+10까지), 브라우저 자동 열기 |
| `실행하기.bat` / `최초설치.bat` | 초보자용 더블클릭 실행/설치 |
| `vercel.json`, `api/index.py` | Vercel 시연 배포용 (DB는 /tmp, 영구 보존 안 됨) |
| `requirements.txt` | openpyxl (엑셀 기능만 필요) |

### 백엔드 (`app/`)
| 경로 | 설명 |
|---|---|
| `app/server.py` | HTTP 라우터. 정적 파일(`web/`, `/photos/`) + JSON API. 라우트 추가는 `do_GET`/`do_POST`에 |
| `app/api.py` | 비즈니스 로직 전부 — 검증 세션(start/parse/finish), 히스토리 검색/삭제, 통계, 이슈 CRUD, 사진 저장, 백업 |
| `app/db.py` | SQLite 연결/초기화. `DATA_DIR`(KNK_DATA_DIR 환경변수로 변경 가능), `query()`/`execute()` 헬퍼 |
| `app/schema.sql` | 테이블 스키마 (12+ 테이블). 새 테이블은 여기 추가 (`CREATE TABLE IF NOT EXISTS`) |
| `app/seed.py` | 최초 실행 시 시드 데이터 (순서도 22단계·체크시트 템플릿·판정기준·분류목록) |
| `app/judge.py` | 판정 엔진 — 정상/주의/알림, 반복성 산포 분석, 호기 편차 비교. 장비 자체판정(device_judge) 존중 |
| `app/report.py` | 엑셀 출력 — 체크시트/주간보고서/히스토리 (openpyxl) |

### 로그 파서 (`app/parsers/`) — 검사기 로그 형식 추가/수정은 여기
| 경로 | 설명 |
|---|---|
| `app/parsers/__init__.py` | `AutoParser`가 로그 내용을 보고 자동 판별. 전용 파서 강제는 `REGISTRY["검사기종류:모델명"]` |
| `app/parsers/base.py` | 파서 인터페이스 (`parse(text)` → `{measurements, meta, parser_name}`) |
| `app/parsers/knk_equip.py` | **실제 장비 공통 파서** — 기능검사기(FUNC)·방수(WP)·PROXIMITY·VSWR·LNA. `$F?` 색상코드, `[항목:타입] 하한<값<상한` 라인, `$$R/$$I` 라인(끝 2자 체크섬), `- 항목 : OK/NG (n/m)` 요약, Test START 블록 10회 이상이면 반복성 |
| `app/parsers/tsp.py` | TSP(터치키) 파서 — Verify Start 블록, KEYRAW/KEYDELTA 배열 + MIN/MAX 규격 |
| `app/parsers/generic_csv.py` | 기본 CSV 형식 (SECTION,ITEM,VALUE,SPEC_LOW,SPEC_HIGH,REPEAT_INDEX) |
| `app/parsers/samples/real/` | **실제 장비 로그 샘플** (검사기 종류별) — 파서 수정 시 회귀 테스트에 사용 |

새 로그 형식 추가 절차: ① `BaseParser` 상속 클래스 작성 → ② `__init__.py`의 `AutoParser.sniff()`에 감지 조건 추가(또는 REGISTRY 등록) → ③ 샘플 로그를 `samples/real/`에 넣고 파싱 확인.

### 프론트엔드 (`web/`)
| 경로 | 설명 |
|---|---|
| `web/index.html` | 뼈대 + 네비게이션(홈/새 검증/히스토리/이슈 관리) |
| `web/js/app.js` | 화면 전부 (SPA). `go(name)`으로 라우팅: renderHome(대시보드)/renderSetup/renderVerify/renderDone/renderHistory(+상세 openRun, 재개 resumeRun)/renderIssues |
| `web/css/style.css` | 스타일. CSS 변수는 `:root`에 정의 |

### API 엔드포인트 요약
- GET `/api/bootstrap` `/api/stats` `/api/issues` `/api/issues/manage` `/api/run/get` `/api/photos` `/api/sample-log` `/api/backup`
- GET `/api/run/report?run_id=` `/api/report/weekly?start=&end=` `/api/history/search` `/api/history/export` (검색 파라미터: start/end/model/customer/tester_type/result)
- POST `/api/run/start` `/api/run/checkitem` `/api/run/parse` `/api/run/finish` `/api/run/photo` `/api/photo/delete` `/api/history/delete` `/api/issue/save` `/api/issue/delete`

### 데이터베이스 주요 테이블
`tester`(호기 마스터) · `inspection_run`(검증 세션) · `check_item`(+`check_item_template`) ·
`measurement`(측정값, repeat_index로 반복성 구분) · `photo` · `issue_history`(사전 안내용 이슈) ·
`issue_record`(검사자 의견 구조화) · `judge_spec`(판정 기준) · `flow_step`(순서도 22단계) ·
`component_type`/`symptom_type`(분류 드롭다운) · `model_test_map` · `reference_doc`

## 자주 하는 작업 위치
- **검사 항목(Check Sheet) 수정** → `app/seed.py`의 템플릿 (기존 DB에는 재시딩 필요: data/quality.db 삭제 후 재실행 또는 직접 UPDATE)
- **판정 기준값 수정** → `judge_spec` 테이블 (시드: `app/seed.py`)
- **순서도 문구 수정** → `flow_step` (시드: `app/seed.py`)
- **새 화면 추가** → `web/js/app.js`에 render 함수 + `go()` 분기 + `index.html` 네비 버튼
- **엑셀 양식 수정** → `app/report.py`

## 테스트
```bash
# 백엔드 스모크
python -c "from app import db,api; db.init_db(); print(api.get_stats())"
# 파서 회귀 (실 로그 샘플)
python -c "
from app.parsers import AutoParser; import glob, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
for p in glob.glob('app/parsers/samples/real/*.log'):
    r = AutoParser().parse(open(p, encoding='utf-8', errors='replace').read())
    print(p, r['parser_name'], len(r['measurements']))"
```

## 주의사항
- 서버 코드를 고치면 **서버 재시작** 필요 (프론트 JS/CSS는 새로고침만).
- `data/quality.db`는 실사용 데이터 — 삭제/재시딩 전 반드시 백업(`/api/backup`).
- 관리팀(신준엽) 전달 시: 소스코드 전체 + 이 `Agents.md` 포함해 전달.
