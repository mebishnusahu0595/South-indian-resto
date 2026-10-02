@echo off
title Kea Print Agent - 24/7 Watchdog
cd /d "%~dp0"

set "PATH=%PATH%;C:\Program Files\nodejs;C:\Program Files (x86)\nodejs;%LOCALAPPDATA%\Programs\nodejs;%USERPROFILE%\AppData\Local\Programs\nodejs;%APPDATA%\npm"
set SERVER_URL=https://keabythepool.com
if exist "%~dp0agent.stop" del /f /q "%~dp0agent.stop" >nul 2>&1
:: Keep the log small: start a fresh one above ~5 MB (previous kept as agent-runtime.old.log).
for %%A in ("%~dp0agent-runtime.log") do if %%~zA gtr 5000000 move /y "%~dp0agent-runtime.log" "%~dp0agent-runtime.old.log" >nul 2>&1

echo [%date% %time%] [WATCHDOG] 24/7 Agent Daemon Started in %~dp0 >> "%~dp0agent-runtime.log" 2>&1
where node >nul 2>&1 || echo [%date% %time%] [WATCHDOG] ERROR: Node.js not found. Install Node.js LTS from https://nodejs.org >> "%~dp0agent-runtime.log" 2>&1

:: Auto-update: use the newest agent.js only if it downloaded completely and is valid JavaScript.
if exist "%SystemRoot%\System32\curl.exe" "%SystemRoot%\System32\curl.exe" -s -f -m 6 https://keabythepool.com/agent.js -o "%~dp0agent.js.new" >nul 2>&1
if exist "%~dp0agent.js.new" node --check "%~dp0agent.js.new" >nul 2>&1
if exist "%~dp0agent.js.new" if not errorlevel 1 move /y "%~dp0agent.js.new" "%~dp0agent.js" >nul 2>&1
if exist "%~dp0agent.js.new" del /f /q "%~dp0agent.js.new" >nul 2>&1

:: One agent per PC: this (newest) start takes over. The old agent is stopped here; its watchdog then
:: finds the agent port taken (exit code 3) and stops itself.
:: ponytail: stops every node.exe on this PC; fine on the counter PC, filter by command line if it ever runs other Node apps.
taskkill /F /IM node.exe >nul 2>&1
ping 127.0.0.1 -n 2 >nul 2>&1

:watchdog_loop
echo [%date% %time%] [WATCHDOG] Starting Kea Print Agent process... >> "%~dp0agent-runtime.log" 2>&1
node agent.js >> "%~dp0agent-runtime.log" 2>&1
set EXIT_CODE=%ERRORLEVEL%
:: 3 = another agent already owns this PC: stop quietly.
if "%EXIT_CODE%"=="3" (
    echo [%date% %time%] [WATCHDOG] Agent already running on this PC. Duplicate watchdog stopped. >> "%~dp0agent-runtime.log" 2>&1
    exit /b 0
)
:: stop-agent.bat was used.
if exist "%~dp0agent.stop" exit /b 0
echo [%date% %time%] [WATCHDOG] Agent process ended (exit code: %EXIT_CODE%). Auto-restarting in 2 seconds... >> "%~dp0agent-runtime.log" 2>&1

:: Wait 2 seconds (ping is 100% reliable in hidden / background execution)
ping 127.0.0.1 -n 3 >nul 2>&1
goto watchdog_loop
