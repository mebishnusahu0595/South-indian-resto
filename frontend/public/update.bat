@echo off
echo ====================================================
echo   Kea Print Agent - Auto Updating
echo ====================================================
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM wscript.exe >nul 2>&1

set "DIR=%USERPROFILE%\Downloads\kea-print-agent"
if not exist "%DIR%" (
    if exist "C:\kea-print-agent" set "DIR=C:\kea-print-agent"
)

cd /d "%DIR%"
echo Updating in: %DIR%
curl -k -f -L https://keabythepool.com/agent.js -o agent.js
if %ERRORLEVEL% EQU 0 (
    echo [SUCCESS] agent.js updated!
    echo Starting agent...
    call START-AGENT-24X7.bat
) else (
    echo [ERROR] Could not download agent.js. Check internet.
)
pause
