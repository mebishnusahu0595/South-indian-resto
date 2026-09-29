@echo off
title Kea Print Agent - Status Check
cd /d "%~dp0"

echo ====================================================
echo        Kea Print Agent - Health Status
echo ====================================================

set AGENT_ACTIVE=0
netstat -ano | findstr /R /C:":39281 *LISTENING" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set AGENT_ACTIVE=1
)

if "%AGENT_ACTIVE%"=="1" (
    echo   [STATUS]: ACTIVE (Port 39281 is listening)
    echo.
    echo   Querying internal health endpoint...
    powershell -NoProfile -Command "try { $res = Invoke-RestMethod -Uri 'http://127.0.0.1:39281/health' -TimeoutSec 2; Write-Host ('   - Cloud Socket Connected: ' + $res.socketConnected); Write-Host ('   - Agent Hostname: ' + $res.hostname); Write-Host ('   - Uptime: ' + $res.uptime + ' seconds'); Write-Host ('   - Process PID: ' + $res.pid); } catch { Write-Host '   - Health server starting up...' }"
) else (
    echo   [STATUS]: OFFLINE / NOT RUNNING
    echo   The Kea Print Agent is currently NOT listening on port 39281.
)

echo ====================================================
echo.
echo Latest Runtime Logs (from agent-runtime.log):
echo ----------------------------------------------------
if exist "%~dp0agent-runtime.log" (
    powershell -NoProfile -Command "Get-Content -Path '%~dp0agent-runtime.log' -Tail 25 -ErrorAction SilentlyContinue"
) else (
    echo [No runtime log file found yet.]
)
echo ----------------------------------------------------
echo.

if "%AGENT_ACTIVE%"=="0" (
    echo [?] Would you like to start the 24/7 Agent Watchdog now?
    set /p START_CHOICE="Press 'Y' to Start now (or press Enter to exit): "
    if /i "%START_CHOICE%"=="Y" (
        echo Starting Kea Print Agent 24/7 Watchdog in background...
        start "" wscript "%~dp0run-hidden.vbs"
        echo [OK] Started! Run check-status.bat again in 5 seconds to verify.
    )
)

pause
