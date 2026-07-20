@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ================================================
echo   KNK 검사기 출하검증 시스템을 시작합니다
echo   잠시 후 브라우저가 자동으로 열립니다.
echo.
echo   ※ 이 검은 창을 닫으면 프로그램이 종료됩니다.
echo     사용하는 동안 창을 열어 두세요.
echo ================================================
echo.

REM --- 이전에 켜져 있던 옛 서버(8000 포트)를 자동 종료 (새 코드 반영 보장) ---
echo [준비] 이전에 실행 중이던 서버가 있으면 정리합니다...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }" >nul 2>nul
echo.

where python >nul 2>nul
if %errorlevel%==0 (
    python run.py
    goto end
)
where py >nul 2>nul
if %errorlevel%==0 (
    py run.py
    goto end
)
echo [오류] Python 이 설치되어 있지 않습니다.
echo 같은 폴더의 "실행가이드.md" 파일을 열어 "1단계. Python 설치"를 따라해 주세요.

:end
echo.
pause
