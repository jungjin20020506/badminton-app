@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
setlocal EnableExtensions
title KNK 지킴 - 시작

REM ===================================================================
REM  ★ 이 파일 하나만 "내 PC(바탕화면)"로 복사해서 쓰세요. ★
REM
REM  왜 복사해야 하나요?
REM    사내 서버(X:)는 IP 주소로 연결돼 있어 Windows 가 "인터넷 영역"으로
REM    분류합니다. 그래서 스마트 앱 컨트롤이 서버 위의 .bat 실행을 막습니다.
REM    ("이 파일은 인터넷에서 ... 위험할 수 있으므로 차단되었습니다")
REM    이 파일을 내 PC에 두고 실행하면 그 차단에 걸리지 않습니다.
REM
REM  하는 일
REM    1) 서버에서 최신 프로그램을 내 PC로 받아옵니다 (실행할 때마다 자동 최신화)
REM    2) 내 PC에서 프로그램을 실행합니다
REM
REM  ※ 파일을 복사하는 것은 "실행"이 아니라서 차단되지 않습니다.
REM     탐색기에서 이 파일을 복사(Ctrl+C) → 바탕화면에 붙여넣기(Ctrl+V) 하세요.
REM ===================================================================

set "LOCALAPP=%LOCALAPPDATA%\KNK출하검증"

REM ---- 서버 위치. 드라이브 문자가 다른 PC 를 위해 UNC 로 자동 대체 ----
set "SRC=X:\연구소문서\출하 관련 자료\15. 품질 AI 프로그램\badminton-app-main"
if not exist "%SRC%\run.py" set "SRC=\\192.168.123.5\knklab\연구소문서\출하 관련 자료\15. 품질 AI 프로그램\badminton-app-main"
if not exist "%SRC%\run.py" goto NOSRC

echo.
echo   서버에서 최신 프로그램을 받아옵니다. 잠시만 기다려 주세요.
echo     서버  : %SRC%
echo     내 PC : %LOCALAPP%
echo.

REM data 폴더는 제외 — 내 PC에 쌓인 데이터를 덮어쓰지 않는다
robocopy "%SRC%" "%LOCALAPP%" /MIR /XD data __pycache__ .git .claude .vscode /XF *.log /R:1 /W:1 /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto COPYFAIL

REM 최초 1회만 — 서버에 쌓여 있던 기존 데이터를 내 PC로 가져온다
if not exist "%LOCALAPP%\data\quality.db" (
  if exist "%SRC%\data\quality.db" (
    echo   서버의 기존 데이터를 내 PC로 가져옵니다...
    robocopy "%SRC%\data" "%LOCALAPP%\data" /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NP >nul
  )
)

if not exist "%LOCALAPP%\runtime\pythonw.exe" goto NORUNTIME
echo   준비 완료. 프로그램을 시작합니다.

REM 이미 켜져 있으면 브라우저만 다시 연다(서버 재기동 없음)
netstat -an | find ":8000" | find "LISTENING" >nul 2>nul
if not errorlevel 1 goto ATTACH

REM 새로 시작 — 크롬(기본 브라우저)으로 열기. 홈 화면 추가(앱 설치)가 되려면
REM 브라우저로 열어야 한다 (네이티브 창은 설치 기능이 없음)
pushd "%LOCALAPP%"
start "" "%LOCALAPP%\runtime\pythonw.exe" "%LOCALAPP%\run.py" --browser
popd
REM robocopy 는 "복사 성공"에도 1 을 돌려주므로, 성공 종료는 0 으로 명시한다
exit 0


:ATTACH
start "" http://localhost:8000
exit 0


:NOSRC
echo.
echo   [오류] 사내 서버에서 프로그램을 찾지 못했습니다.
echo   · 서버 드라이브(X:)가 연결돼 있는지 확인해 주세요.
echo   · 확인한 위치:
echo       X:\연구소문서\출하 관련 자료\15. 품질 AI 프로그램\badminton-app-main
echo       \\192.168.123.5\knklab\연구소문서\...
echo.
pause
exit /b 1


:COPYFAIL
echo.
echo   [오류] 프로그램을 내 PC로 받아오지 못했습니다.
echo   서버 폴더 접근 권한을 확인해 주세요.
echo.
pause
exit /b 1


:NORUNTIME
echo.
echo   [오류] runtime 폴더를 받아오지 못했습니다. 다시 실행해 주세요.
echo.
pause
exit /b 1


:FAIL
echo.
echo   프로그램 시작에 실패했습니다.
echo   %LOCALAPP%\진단하기.bat 을 실행해 원인을 확인해 주세요.
echo.
pause
exit /b 1
