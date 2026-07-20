# KNK 검사기 출하검증 자동화 프로그램

케이엔케이(KNK) 품질팀용 **검사기(테스터) 출하검증 로컬 프로그램**입니다.
출하 검사 순서도대로 검증하고 → 검사 데이터를 자동 판정하고 → 데이터를 로컬 DB에 축적합니다.

> 개발 명세서 기준 **1단계(검사기 검증)** + **2단계(문서 자동화 — 체크시트 엑셀 출력)** 완성본입니다.
> 3단계(AI 지원)는 같은 DB·구조 위에서 확장할 수 있도록 준비되어 있습니다.

## 핵심 설계 — 하나의 DB를 공유
```
[① 검사기 검증]  ← 완성
[② 문서 자동화]  ← 완성 (체크시트 엑셀 출력)  →  [공통 DB(SQLite): 검사데이터·호기이력·이슈·검사자의견]
[③ AI 지원]      ← AS 챗봇 데모 동작 (규칙기반, 무료·오프라인) / 사내 LLM 연결 시 답변부만 교체
```

## AI 도우미(AS 챗봇) — 3단계 데모
상단 메뉴 **🤖 AI 도우미**에서 동작합니다. 축적된 출하이슈(`issue_history`)와 검사
순서도(`flow_step`)를 **검색**해 답합니다. 외부 API·인터넷·설치·비용이 전혀 없습니다.
- 예) "SM-F971U VSWR 이슈 알려줘", "드림텍 방수 불량", "음샘 가성불량 조치법",
  "출하검사 순서 알려줘", "전체 이슈 통계"
- 엔진: [`app/chatbot.py`](app/chatbot.py) — `retrieve()`(근거 검색) + `_rule_answer()`(포맷)
- 답변의 **근거 카드를 클릭**하면 이슈 관리에서 해당 모델을 바로 조회
- **로컬 AI(무료)**: Ollama가 설치돼 있으면 챗봇 화면의 "🧠 로컬 AI 사용" 토글로 진짜 LLM 답변.
  없으면 규칙기반으로 자동 폴백 → [`app/chatbot.py`](app/chatbot.py) `_ollama_answer()`
- **사내 OpenAI 연결 시**: `chatbot._llm_answer()`에 `provider=='openai'` 분기만 추가(검색 근거 재사용)

## 📊 분석 대시보드
상단 **📊 분석** 메뉴 — 축적 데이터를 자동 집계합니다.
- **불량 유형 파레토**(증상 분류별 건수+누적%), **월별 이슈 추이**(고객사별), **요주의 모델 Top**
- **주간보고 초안 자동 생성**: 기간 선택 → 통계·다발 모델·주요 이슈를 문장으로 생성해 복사
- 이슈 관리 화면에 **증상 분류 필터**(접촉불량·오조립·파손 등) 추가

## 자동 백업
프로그램 시작 시 `data/backups/quality-YYYYMMDD.db`로 **하루 1개 자동 백업**(최근 14개 보관).
`app/backup.py` · 홈의 "DB 백업" 버튼으로 수동 다운로드도 가능.

## 실행 방법
> 🔰 **처음이라면 [실행가이드.md](실행가이드.md) 를 보세요.**
> 요약: `최초설치.bat`(1회) → `실행하기.bat` 더블클릭. 그게 전부입니다.

Python 3.9 이상이 필요합니다. 검증 화면 자체는 표준 라이브러리만으로 동작하고,
**체크시트 엑셀(.xlsx) 다운로드 기능만 `openpyxl` 설치가 한 번 필요**합니다(인터넷 필요).

```bash
pip install -r requirements.txt   # 최초 1회 (엑셀 다운로드 기능용 openpyxl 설치)

python run.py                 # 실행 후 브라우저가 자동으로 열립니다 (http://127.0.0.1:8000)
python run.py --port 9000     # 포트 변경 (사용 중이면 자동으로 다음 포트 시도)
python run.py --no-browser    # 브라우저 자동 열기 끄기
```
> 오프라인 사내 PC를 우선 고려해 FastAPI 대신 Python 표준 라이브러리(http.server + sqlite3)로
> 구현했습니다. `pip install`(최초 1회, 인터넷 필요) 이후에는 사내 방화벽·인터넷 제약과 무관하게
> 실행됩니다. openpyxl을 설치하지 않아도 검증 진행 자체는 그대로 동작하고, 엑셀 다운로드 버튼을
> 누를 때만 설치 안내 메시지가 표시됩니다.

## 1단계 기능 (동작)
- **순서도 안내**: 출하검사 순서도 22단계를 "지금 할 일"로 단계별 안내
- **검사 항목 체크**: 최종 check Sheet 기준 항목 PASS/FAIL (고객사 전용 항목 자동 포함 — 예: 드림텍 NG STOP)
- **로그 자동 판정**: PASS DATA(CSV) 업로드/붙여넣기 → 자동 판정
  - Open `0<X<150000`(정상 15000) / Short `0<X<10`
  - **경계값 → 주의**, **규격 이탈 → 알림** 자동 표시
  - **반복성 분석**: 기본 40회 분산·산포, 가성 불량 2NG↑ 시 재측정 안내
- **호기 편차 비교(양산 모드)**: 앞 호기 데이터와 자동 비교, 편차 크면 경고
- **검사 전 이슈 안내**: 모델 선택 시 `issue_history`의 과거 이슈를 먼저 표시
- **3가지 모드**: 신규 / MODIFY / 양산 — 모드별 안내·동작 분기

## 2단계 기능 (동작)
- **체크시트 엑셀 다운로드**: 검증 완료 화면의 "📊 엑셀 다운로드" 버튼 → `GET /api/run/report?run_id=`
  로 그 검증 세션의 체크시트를 `.xlsx` 파일로 즉시 생성. 모델·검사기 정보, 검사 항목 PASS/FAIL(색상 표시),
  측정 로그 판정 결과, 검사자 의견까지 한 파일에 포함됩니다. openpyxl 미설치 시 설치 안내 메시지가 표시됩니다.

## 관리 기능 (동작)
- **홈 대시보드**: 총 검증/PASS/FAIL/이번 달 건수, 검사기종류별 분포, 최근 검증 5건 (`GET /api/stats`)
- **검증 히스토리**: 날짜·모델명·고객사·검사기종류·판정으로 검색, 행 클릭 시 상세(체크시트·측정값·사진·의견),
  선택 삭제, 목록 엑셀 내보내기, 미완료 건 "이어서 하기" (`/api/history/*`, `/api/run/get`)
- **이슈 이력 관리**: 모델별 과거 이슈 등록·수정·삭제 UI — 등록 즉시 새 검증 시작 시 사전 안내에 반영 (`/api/issue/*`)
- **검증 사진 첨부**: 검증 화면에서 이미지 첨부 → `data/photos/`에 저장, 히스토리 상세에서 조회 (`/api/run/photo`)
- **DB 백업**: 홈 화면에서 `quality.db`를 파일로 다운로드 (`GET /api/backup`)

## 검사기 종류
기능검사기 · 방수 · VSWR · LNA · PROXIMITY · 지문 · TSP

## 프로젝트 구조
```
실행하기.bat             # 더블클릭 실행 (초보자용)
최초설치.bat             # 엑셀 기능 설치 1회용 (초보자용)
실행가이드.md            # 초보자용 설치·실행·FAQ 안내
run.py                  # 실행 진입점 (포트 사용 중이면 자동으로 다음 포트)
app/
  server.py             # http.server 라우터 (정적 + JSON API)
  api.py                # 비즈니스 로직 (검증 세션/판정/저장)
  db.py                 # SQLite 연결·초기화
  schema.sql            # 12개 테이블 스키마 (명세 섹션 3 + 3단계 준비: issue_record 등)
  seed.py               # 초기 데이터 시딩 (명세 섹션 5: 순서도 22단계·체크시트·판정기준·더미)
  judge.py              # 판정 엔진 (Open/Short·경계·이탈 / 반복성 / 호기 편차)
  report.py             # 2단계: 체크시트 엑셀(.xlsx) 생성 (openpyxl)
  parsers/              # 로그 파서 플러그인 (모델별 교체 가능)
    base.py             #   인터페이스
    generic_csv.py      #   기본 CSV 파서
    __init__.py         #   레지스트리(get_parser)
    samples/sample_pass_data.csv  # 샘플 로그
web/                    # 프론트엔드 (HTML/CSS/JS, 빌드·CDN 불필요)
data/quality.db         # 런타임 생성 로컬 DB (git 제외)
requirements.txt        # openpyxl (엑셀 다운로드 기능용, 선택 설치)
```

## 로그 파서 — 실제 장비 로그 자동 인식
로그 내용을 보고 형식을 **자동 판별**합니다 (`app/parsers/__init__.py`의 `AutoParser`).

| 파서 | 대상 | 특징 |
|---|---|---|
| `knk_equip` | 기능검사기(FUNC) · 방수(WP) · PROXIMITY · VSWR · LNA | `$F?` 색상코드 제거, `[항목:타입] 하한<값<상한` 측정 라인, `$$R/$$I` 라인(체크섬), `- 항목 : OK/NG (n/m)` 장비 자체 판정 반영, 모델명 불일치 경고 |
| `tsp` | TSP(터치키) | Verify Start 블록별 KEYRAW/KEYDELTA 배열 + 키별 MIN/MAX 규격 |
| `generic_csv` | 수기 CSV | `SECTION,ITEM,VALUE,SPEC_LOW,SPEC_HIGH,REPEAT_INDEX` |

- 측정 블록(Test START/Verify Start)이 **10회 이상 반복되면 반복성 데이터**로 자동 전환 → 회차별 산포 분석
- 실제 장비 로그 샘플: `app/parsers/samples/real/` (검사기 종류별 회귀 테스트용)
- 새 포맷 추가: `BaseParser` 상속 클래스 작성 후 `AutoParser.sniff()` 또는 `REGISTRY`에 등록

## 테스트
```bash
# 백엔드 로직 스모크 테스트
python3 -c "from app import db,api; db.init_db(); r=api.start_run({'model_name':'SM-S952 SUB','tester_type':'방수','unit_no':5,'inspector':'검사자','verify_mode':'양산'}); print(api.parse_log(r['run_id'], api.sample_log_text(), '방수','SM-S952 SUB')['summary'])"
```
브라우저에서 `python run.py` 실행 후 새 검증 → 샘플 로그 불러오기 → 자동 판정으로 확인할 수 있습니다.

## 배포 (Vercel — 시연용)
`vercel.json` + `api/index.py` 로 Vercel 배포가 구성되어 있습니다.
정적 프론트엔드(`web/`)는 CDN에서, API는 Python 서버리스 함수로 동작합니다.
> ⚠️ Vercel 서버리스는 파일시스템이 읽기전용이라 DB를 `/tmp`에 생성합니다.
> 인스턴스 재시작 시 시드 데이터가 초기화되므로 **데이터 영구 축적은 로컬 실행(`python run.py`)** 에서 이뤄집니다.
> Vercel 배포는 대표님/동료에게 URL로 보여주기 위한 **시연 용도**입니다.

## 확장 로드맵 (명세 2·3단계)
- **2단계 문서 자동화**: 체크시트 엑셀 출력 완성. 고객사별 주말보고서 자동 출력, 사진 배치는 추가 확장 예정
- **3단계 AI 지원**: 셀프 AS 챗봇, 보고서 요약, 메뉴얼 학습 (Claude API + `issue_history`·순서도 근거)

### 3단계 준비 — 검수자 의견 구조화 스키마
검증 완료 화면(4번 섹션)에서 검사자 의견을 남길 때 **관련 부품**·**증상 분류** 드롭다운을 함께
선택하면, 원문은 그대로 보존한 채(`issue_record.raw_text`) 검색용 분류 칸(`component`,
`symptom_type`)이 함께 저장됩니다. 모델명이 달라도 부품 기준으로 과거 이력을 검색할 수 있어
(`GET /api/issue-records?component=마이크`), 3단계 챗봇의 근거 데이터로 바로 활용됩니다.

- `component_type` / `symptom_type` — 표준 분류 목록(드롭다운 소스, `app/seed.py`에서 관리)
- `issue_record` — 원문 + 분류 + (추후 AI 자동 요약용) `summary`/`action` 칸
- `model_test_map` — 모델 ↔ 검사기 종류 매핑(N:M) 뼈대
- `reference_doc` — 메뉴얼·사진 등 파일은 파일서버에 두고, 설명 텍스트와 경로만 색인
