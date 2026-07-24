@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
setlocal EnableExtensions
title KNK 지킴 - 팀 서버

REM ===================================================================
REM  팀 공용 서버 모드
REM   이 PC 한 대만 켜두면 같은 사내망의 다른 PC는 브라우저로 접속해 사용.
REM   데이터가 이 PC 한 곳에만 쌓여 충돌/분산이 없다.
REM   ※ 여러 명이 데이터를 "함께" 쓰려면 이 모드를 쓰세요.
REM      (프로그램 폴더를 각자 실행하면 데이터는 각 PC에 따로 쌓입니다)
REM ===================================================================

set "SRC=%~dp0"
set "LOCALAPP=%LOCALAPPDATA%\KNK출하검증"

REM ---- 사내 서버(네트워크)에서 실행하면 내 PC로 복사한 뒤 구동 ----
set "ISNET="
echo %SRC%| findstr /b /c:"\\" >nul && set "ISNET=1"
if not defined ISNET net use %~d0 >nul 2>nul && set "ISNET=1"

if not defined ISNET (
  set "RUNDIR=%SRC%"
) else (
  echo  사내 서버에서 실행 - 프로그램을 내 PC로 복사합니다...
  robocopy "%SRC%." "%LOCALAPP%" /MIR /XD data __pycache__ .git .claude .vscode /XF *.log /R:1 /W:1 /NFL /NDL /NJH /NJS /NP >nul
  if errorlevel 8 goto COPYFAIL
  REM 최초 1회만 — 서버의 기존 데이터를 이 PC로 가져온다
  if not exist "%LOCALAPP%\data\quality.db" (
    if exist "%SRC%data\quality.db" robocopy "%SRC%data" "%LOCALAPP%\data" /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NP >nul
  )
  set "RUNDIR=%LOCALAPP%\"
)

pushd "%RUNDIR%" 2>nul
if errorlevel 1 goto NOPATH

echo ================================================
echo   KNK 출하검증 - 팀 서버 모드
echo ================================================
echo.

call :FIND_PYTHON
if not defined PY goto NOPY

echo  준비 중...
REM 이미 떠 있는 서버 종료 (PowerShell 미사용 — 스마트 앱 컨트롤 대비)
for /f "tokens=5" %%p in ('netstat -ano ^| find ":8000" ^| find "LISTENING"') do taskkill /F /PID %%p >nul 2>nul
echo.
echo ------------------------------------------------
echo   * 아래에 표시되는 주소를 팀원에게 알려주세요.
echo   * 이 창을 닫으면 팀원도 사용할 수 없습니다. 켜 두세요.
echo   * 방화벽 창이 뜨면 반드시 [액세스 허용] 을 눌러 주세요.
echo ------------------------------------------------
echo.
%PY% -u "%RUNDIR%run.py" --host 0.0.0.0
goto END


:FIND_PYTHON
set "PY="
if exist "%RUNDIR%runtime\python.exe" set PY="%RUNDIR%runtime\python.exe"
if defined PY exit /b
py -3 -c "import sys" >nul 2>nul && set "PY=py -3" && exit /b
py -c "import sys" >nul 2>nul && set "PY=py" && exit /b
python -c "import sys" >nul 2>nul && set "PY=python" && exit /b
exit /b


:COPYFAIL
echo.
echo   [오류] 프로그램을 내 PC로 복사하지 못했습니다. 서버 접근 권한을 확인해 주세요.
echo.
pause
exit /b 1


:NOPATH
echo   [오류] 프로그램 폴더로 이동하지 못했습니다.
echo.
pause
exit /b 1


:NOPY
echo.
echo   [오류] runtime 폴더가 없습니다. 서버의 원본 폴더를 다시 복사해 주세요.
echo.
goto END


:END
echo.
popd
pause
