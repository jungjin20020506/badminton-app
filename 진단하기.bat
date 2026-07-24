@echo off
chcp 65001 >nul
setlocal EnableExtensions
title KNK 지킴 - 진단

REM ===================================================================
REM  실행이 안 될 때 원인을 찾는 진단 도구.
REM  결과를 그대로 캡처해서 담당자에게 보내주시면 됩니다.
REM ===================================================================

echo ================================================
echo   KNK 출하검증 - 진단
echo ================================================
echo.

echo [1] 실행 위치
echo     %~dp0
set "ISNET="
echo %~dp0| findstr /b /c:"\\" >nul && set "ISNET=1"
if not defined ISNET net use %~d0 >nul 2>nul && set "ISNET=1"
if defined ISNET (
  echo     -^> 사내 서버^(네트워크^) 위입니다.
  echo.
  echo     ★ 서버 폴더의 .bat 을 직접 누르면 스마트 앱 컨트롤이 차단합니다.
  echo       ^("이 파일은 인터넷에서 ... 위험할 수 있으므로 차단되었습니다"^)
  echo       -^> "내PC에서_실행하기.bat" 을 내 PC 바탕화면으로 복사한 뒤
  echo          거기서 더블클릭하세요. 그러면 차단되지 않습니다.
) else (
  echo     -^> 내 PC 로컬입니다. ^(차단 없이 실행됩니다^)
)
echo.

echo [2] 런타임 파일
if exist "%~dp0runtime\pythonw.exe" (echo     runtime\pythonw.exe : 있음) else (echo     runtime\pythonw.exe : 없음 ^<== 원본 폴더를 다시 복사하세요)
if exist "%~dp0run.py" (echo     run.py              : 있음) else (echo     run.py              : 없음)
echo.

echo [3] 파이썬 실행 테스트
if exist "%~dp0runtime\python.exe" (
  "%~dp0runtime\python.exe" -c "print('     실행 OK -', __import__('sys').version.split()[0])" 2>&1
  if errorlevel 1 echo     ^<== 실행 차단됨. 스마트 앱 컨트롤/백신 차단 가능성이 큽니다.
) else (
  echo     runtime 없음 - 건너뜀
)
echo.

echo [4] 스마트 앱 컨트롤 상태
reg query "HKLM\SYSTEM\CurrentControlSet\Control\CI\Policy" /v VerifiedAndReputablePolicyState 2>nul | find "0x1" >nul && echo     켜짐^(적용^) - 네트워크 위 실행 파일이 차단될 수 있습니다
reg query "HKLM\SYSTEM\CurrentControlSet\Control\CI\Policy" /v VerifiedAndReputablePolicyState 2>nul | find "0x2" >nul && echo     평가 모드
reg query "HKLM\SYSTEM\CurrentControlSet\Control\CI\Policy" /v VerifiedAndReputablePolicyState 2>nul | find "0x0" >nul && echo     꺼짐
echo.

echo [5] 사내 서버^(Z:^) 연결
for %%d in (Z Y X W V U) do (
  if exist "%%d:\드림텍" echo     %%d:\ 에서 드림텍 폴더 확인 - 연동 가능
)
if exist "\\192.168.123.6\knkwork\드림텍" echo     UNC \\192.168.123.6\knkwork 확인 - 연동 가능
echo.

echo [6] 포트 8000 사용 상태
netstat -an | find ":8000" | find "LISTENING" >nul 2>nul
if errorlevel 1 (echo     비어 있음 ^(정상^)) else (echo     이미 실행 중입니다 - 종료하기.bat 을 먼저 실행하세요)
echo.

echo [7] 내 PC 복사본 위치
echo     %LOCALAPPDATA%\KNK출하검증
if exist "%LOCALAPPDATA%\KNK출하검증\run.py" (echo     -^> 복사본 있음) else (echo     -^> 아직 없음 ^(실행하기.bat 최초 실행 시 생성^))
echo.

echo ================================================
echo   진단 완료. 위 내용을 캡처해 담당자에게 보내주세요.
echo ================================================
echo.
pause
