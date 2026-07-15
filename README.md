# KNK 검사기 출하검증 자동화 프로그램

케이엔케이(KNK) 품질팀용 **검사기(테스터) 출하검증 로컬 프로그램**입니다.
출하 검사 순서도대로 검증하고 → 검사 데이터를 자동 판정하고 → 데이터를 로컬 DB에 축적합니다.

> 개발 명세서 기준 **1단계(검사기 검증)** 완성본입니다. 2·3단계(문서 자동화 / AI 지원)는
> 같은 DB·구조 위에서 확장할 수 있도록 설계되어 있습니다.

## 핵심 설계 — 하나의 DB를 공유
```
[① 검사기 검증]  ← 현재 완성
[② 문서 자동화]  ── 확장 예정  →  [공통 DB(SQLite): 검사데이터·호기이력·이슈·검사자의견]
[③ AI 지원]      ── 확장 예정
```

## 실행 방법 (설치 불필요)
Python 3.9 이상만 있으면 됩니다. **별도 라이브러리 설치가 필요 없습니다** (표준 라이브러리만 사용).

```bash
python run.py                 # 실행 후 브라우저가 자동으로 열립니다 (http://127.0.0.1:8000)
python run.py --port 9000     # 포트 변경
python run.py --no-browser    # 브라우저 자동 열기 끄기
```
> 오프라인 사내 PC를 우선 고려해 FastAPI 대신 Python 표준 라이브러리(http.server + sqlite3)로
> 구현했습니다. 사내 방화벽·인터넷 제약과 무관하게 실행됩니다.

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

## 검사기 종류
기능검사기 · 방수 · VSWR · LNA · PROXIMITY · 지문 · TSP

## 프로젝트 구조
```
run.py                  # 실행 진입점
app/
  server.py             # http.server 라우터 (정적 + JSON API)
  api.py                # 비즈니스 로직 (검증 세션/판정/저장)
  db.py                 # SQLite 연결·초기화
  schema.sql            # 7개 테이블 스키마 (명세 섹션 3)
  seed.py               # 초기 데이터 시딩 (명세 섹션 5: 순서도 22단계·체크시트·판정기준·더미)
  judge.py              # 판정 엔진 (Open/Short·경계·이탈 / 반복성 / 호기 편차)
  parsers/              # 로그 파서 플러그인 (모델별 교체 가능)
    base.py             #   인터페이스
    generic_csv.py      #   기본 CSV 파서
    __init__.py         #   레지스트리(get_parser)
    samples/sample_pass_data.csv  # 샘플 로그
web/                    # 프론트엔드 (HTML/CSS/JS, 빌드·CDN 불필요)
data/quality.db         # 런타임 생성 로컬 DB (git 제외)
```

## 로그 파서 (교체 가능)
실제 로그 포맷은 미확정이므로 **모델별 파서 플러그인** 구조로 설계했습니다.
새 포맷 확정 시 `app/parsers/`에 `BaseParser` 상속 클래스를 만들고
`app/parsers/__init__.py`의 `REGISTRY`에 등록하면 됩니다. 기본 샘플 포맷은
`app/parsers/samples/sample_pass_data.csv` 를 참고하세요.

## 테스트
```bash
# 백엔드 로직 스모크 테스트
python3 -c "from app import db,api; db.init_db(); r=api.start_run({'model_name':'SM-S952 SUB','tester_type':'방수','unit_no':5,'inspector':'검사자','verify_mode':'양산'}); print(api.parse_log(r['run_id'], api.sample_log_text(), '방수','SM-S952 SUB')['summary'])"
```
브라우저에서 `python run.py` 실행 후 새 검증 → 샘플 로그 불러오기 → 자동 판정으로 확인할 수 있습니다.

## 확장 로드맵 (명세 2·3단계)
- **2단계 문서 자동화**: 고객사별 체크시트/주말보고서 자동 출력(openpyxl), 사진 배치
- **3단계 AI 지원**: 셀프 AS 챗봇, 보고서 요약, 메뉴얼 학습 (Claude API + `issue_history`·순서도 근거)
