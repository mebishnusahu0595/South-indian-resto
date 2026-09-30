@echo off
title Kea Print Agent - 24/7 Watchdog
cd /d "%~dp0"

set "PATH=%PATH%;C:\Program Files\nodejs;C:\Program Files (x86)\nodejs;%LOCALAPPDATA%\Programs\nodejs;%USERPROFILE%\AppData\Local\Programs\nodejs;%APPDATA%\npm"
set SERVER_URL=https://keabythepool.com

echo [%date% %time%] [WATCHDOG] 24/7 Agent Daemon Started >> "%~dp0agent-runtime.log" 2>&1

:watchdog_loop
echo [%date% %time%] [WATCHDOG] Starting Kea Print Agent process... >> "%~dp0agent-runtime.log" 2>&1
node agent.js >> "%~dp0agent-runtime.log" 2>&1
set EXIT_CODE=%ERRORLEVEL%
:: 3 = another agent already owns this PC (Startup shortcut + Scheduled Task both fire at logon): stop quietly.
if "%EXIT_CODE%"=="3" (
    echo [%date% %time%] [WATCHDOG] Agent already running on this PC. Duplicate watchdog stopped. >> "%~dp0agent-runtime.log" 2>&1
    exit /b 0
)
echo [%date% %time%] [WATCHDOG] Agent process ended (exit code: %EXIT_CODE%). Auto-restarting in 2 seconds... >> "%~dp0agent-runtime.log" 2>&1

:: Wait 2 seconds (ping is 100% reliable in hidden / background execution)
ping 127.0.0.1 -n 3 >nul 2>&1
goto watchdog_loop


