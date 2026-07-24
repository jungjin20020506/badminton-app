@echo off
chcp 65001 >nul
setlocal EnableExtensions
title KNK 지킴 - 종료
echo.
echo   프로그램을 종료합니다...

REM 8000 포트를 듣고 있는 프로세스를 찾아 종료.
REM PowerShell 미사용 — 스마트 앱 컨트롤이 켜진 PC에서도 확실히 동작하도록
REM cmd 기본 명령(netstat/taskkill)만 쓴다.
set "FOUND="
for /f "tokens=5" %%p in ('netstat -ano ^| find ":8000" ^| find "LISTENING"') do (
  taskkill /F /PID %%p >nul 2>nul
  set "FOUND=1"
)

if defined FOUND (echo   종료되었습니다.) else (echo   실행 중인 프로그램이 없습니다.)
timeout /t 2 /nobreak >nul
exit
