@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ================================================
echo   최초 1회 설치 — 엑셀 다운로드 기능용(openpyxl)
echo   (인터넷 연결이 필요합니다)
echo ================================================
echo.

where python >nul 2>nul
if %errorlevel%==0 (
    python -m pip install -r requirements.txt
    goto done
)
where py >nul 2>nul
if %errorlevel%==0 (
    py -m pip install -r requirements.txt
    goto done
)
echo [오류] Python 이 설치되어 있지 않습니다.
echo 같은 폴더의 "실행가이드.md" 파일을 열어 "1단계. Python 설치"를 따라해 주세요.
goto end

:done
echo.
echo ================================================
echo   설치가 끝났습니다!
echo   이제 "실행하기.bat" 를 더블클릭해 프로그램을 시작하세요.
echo ================================================

:end
echo.
pause
