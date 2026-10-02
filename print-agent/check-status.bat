@echo off
title Kea Print Agent - Status Check
cd /d "%~dp0"
set "PATH=%PATH%;C:\Program Files\nodejs;C:\Program Files (x86)\nodejs;%LOCALAPPDATA%\Programs\nodejs;%USERPROFILE%\AppData\Local\Programs\nodejs;%APPDATA%\npm"

echo ====================================================
echo        Kea Print Agent - Health Status
echo ====================================================

set AGENT_ACTIVE=0
netstat -ano | findstr /R /C:":39281 .*LISTENING" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set AGENT_ACTIVE=1
)

if "%AGENT_ACTIVE%"=="1" (
    echo   [STATUS]: ACTIVE - Port 39281 is listening
    echo.
    echo   Querying internal health endpoint...
    rem curl ships with Windows 10/11; PowerShell is blocked on some PCs and prints nothing.
    "%SystemRoot%\System32\curl.exe" -s -m 3 http://127.0.0.1:39281/health
    echo.
) else (
    echo   [STATUS]: OFFLINE / NOT RUNNING
    echo   The Kea Print Agent is currently NOT listening on port 39281.
)

echo   Agent folder: %~dp0
where node >nul 2>&1 && echo   Node.js: installed || echo   Node.js: NOT FOUND - install Node.js LTS from https://nodejs.org
if exist "%~dp0agent-runtime.log" for %%A in ("%~dp0agent-runtime.log") do echo   Log size: %%~zA bytes
echo ====================================================
echo.
echo Latest Runtime Logs (from agent-runtime.log):
echo ----------------------------------------------------
if not exist "%~dp0agent-runtime.log" goto :no_log
for /f %%C in ('find /c /v "" ^< "%~dp0agent-runtime.log"') do set /a SKIP=%%C-25
if %SKIP% lss 0 set SKIP=0
more +%SKIP% "%~dp0agent-runtime.log"
goto :log_done
:no_log
echo [No runtime log file found yet.]
:log_done
echo ----------------------------------------------------
echo.

if "%AGENT_ACTIVE%"=="1" goto :done
:: Outside a ( ) block so %START_CHOICE% is read after set /p, not before.
echo [?] Would you like to start the 24/7 Agent Watchdog now?
set /p START_CHOICE="Press ENTER or 'Y' to Start now (or 'N' to exit): "
if /i "%START_CHOICE%"=="N" goto :done
echo Starting Kea Print Agent 24/7 Watchdog in background...
start "" wscript "%~dp0run-hidden.vbs"
echo [OK] Started! Run check-status.bat again in 5 seconds to verify.

:done
pause
