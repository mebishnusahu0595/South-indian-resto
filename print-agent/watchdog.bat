@echo off
title Kea Print Agent - 24/7 Watchdog (2s Interval)
cd /d "%~dp0"

:: 1. Detect node executable in standard Windows paths
set "NODE_EXE=node"
if exist "C:\Program Files\nodejs\node.exe" set "NODE_EXE=C:\Program Files\nodejs\node.exe"
if exist "C:\Program Files (x86)\nodejs\node.exe" set "NODE_EXE=C:\Program Files (x86)\nodejs\node.exe"
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if exist "%USERPROFILE%\AppData\Local\Programs\nodejs\node.exe" set "NODE_EXE=%USERPROFILE%\AppData\Local\Programs\nodejs\node.exe"

set SERVER_URL=https://keabythepool.com

echo [%date% %time%] [WATCHDOG] 24/7 Monitoring loop started (checking every 2 seconds). Node: %NODE_EXE% >> "%~dp0agent-runtime.log" 2>&1

:watchdog_loop
:: Check if Port 39281 is active (exclusive Kea Print Agent lock/health port)
netstat -ano | findstr /R /C:":39281 *LISTENING" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    goto wait_2s
)

:: If not listening, start the agent process immediately!
echo [%date% %time%] [WATCHDOG] Kea Print Agent is offline! Starting process immediately... >> "%~dp0agent-runtime.log" 2>&1
"%NODE_EXE%" agent.js >> "%~dp0agent-runtime.log" 2>&1
set EXIT_CODE=%ERRORLEVEL%
echo [%date% %time%] [WATCHDOG] Agent process exited with code %EXIT_CODE%. Checking again in 2 seconds... >> "%~dp0agent-runtime.log" 2>&1

:wait_2s
timeout /t 2 /nobreak >nul 2>&1
if errorlevel 1 ping 127.0.0.1 -n 3 >nul 2>&1
goto watchdog_loop

