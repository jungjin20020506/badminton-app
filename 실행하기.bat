@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
setlocal EnableExtensions
title KNK 지킴 - 실행

REM ===================================================================
REM  실행 원칙
REM   · 프로그램이 사내 서버(X: 등 네트워크 드라이브/UNC)에 있으면
REM     내 PC로 복사한 뒤 "로컬에서" 실행한다.
REM      - 스마트 앱 컨트롤/SmartScreen 은 네트워크 위의 실행 파일을 막는다.
REM      - SQLite DB 를 공유 폴더에 두고 여러 명이 쓰면 DB 가 깨진다.
REM   · Z: 서버 연동과 출하이슈사항 동기화는 로컬 실행에서도 그대로 동작한다.
REM   · PowerShell 을 쓰지 않는다 — 스마트 앱 컨트롤이 켜지면 PowerShell 이
REM     제약 언어 모드로 돌아 명령이 막히는 경우가 있어 cmd 기본 명령만 쓴다.
REM ===================================================================

set "SRC=%~dp0"
set "LOCALAPP=%LOCALAPPDATA%\KNK출하검증"

REM ---- 지금 위치가 네트워크인지 판별 (UNC 또는 매핑 드라이브) ----
set "ISNET="
echo %SRC%| findstr /b /c:"\\" >nul && set "ISNET=1"
if not defined ISNET net use %~d0 >nul 2>nul && set "ISNET=1"

if defined ISNET goto FROM_SERVER
set "RUNDIR=%SRC%"
goto LAUNCH


:FROM_SERVER
echo.
echo   사내 서버에서 실행합니다.
echo   프로그램을 내 PC로 복사한 뒤 실행합니다 (처음 한 번은 시간이 걸립니다).
echo     복사 위치: %LOCALAPP%
echo.
REM data 폴더는 제외 — 내 PC에 쌓인 데이터를 덮어쓰지 않는다.
robocopy "%SRC%." "%LOCALAPP%" /MIR /XD data __pycache__ .git .claude .vscode /XF *.log /R:1 /W:1 /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto COPYFAIL

REM 최초 1회만 — 서버에 쌓여 있던 기존 데이터를 내 PC로 가져온다.
REM (두 번째 실행부터는 내 PC 데이터를 쓰므로 덮어쓰지 않는다)
if not exist "%LOCALAPP%\data\quality.db" (
  if exist "%SRC%data\quality.db" (
    echo   서버의 기존 데이터를 내 PC로 가져옵니다...
    robocopy "%SRC%data" "%LOCALAPP%\data" /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NP >nul
  )
)

set "RUNDIR=%LOCALAPP%\"
echo   복사 완료.
echo.


:LAUNCH
if not exist "%RUNDIR%runtime\pythonw.exe" goto NORUNTIME

REM 이미 켜져 있으면 창만 하나 더 붙인다(서버 재기동 없음)
netstat -an | find ":8000" | find "LISTENING" >nul 2>nul
if not errorlevel 1 goto ATTACH

REM 새로 시작 — 크롬(기본 브라우저)으로 열기. 홈 화면 추가(앱 설치)가 되려면
REM 브라우저로 열어야 한다 (네이티브 창은 설치 기능이 없음)
pushd "%RUNDIR%"
start "" "%RUNDIR%runtime\pythonw.exe" "%RUNDIR%run.py" --browser
popd
REM robocopy 는 "복사 성공"에도 1 을 돌려주므로, 성공 종료는 0 으로 명시한다
exit 0


:ATTACH
start "" http://localhost:8000
exit 0


:FAIL
echo.
echo   프로그램 시작에 실패했습니다.
echo   "진단하기.bat" 을 실행해 원인을 확인해 주세요.
echo.
pause
exit /b 1


:COPYFAIL
echo.
echo   [오류] 프로그램을 내 PC로 복사하지 못했습니다.
echo   · 서버 폴더에 접근 권한이 있는지 확인해 주세요.
echo   · 복사 위치: %LOCALAPP%
echo.
pause
exit /b 1


:NORUNTIME
echo.
echo   [오류] runtime 폴더가 없습니다.
echo   서버의 원본 폴더를 통째로 다시 복사해 주세요.
echo.
pause
exit /b 1
