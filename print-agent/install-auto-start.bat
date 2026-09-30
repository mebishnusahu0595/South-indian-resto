@echo off
title Kea Print Agent - 24/7 Auto Start ^& Protocol Setup
cd /d "%~dp0"

echo ====================================================
echo   Kea Print Agent - 24/7 Auto Start ^& Auto-Run Setup

echo ====================================================
echo.

set "VBS_PATH=%~dp0run-hidden.vbs"
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_FOLDER%\KeaPrintAgent.lnk"

:: 1. Add to Windows Startup folder
echo [1/4] Registering in Windows Startup folder...
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_PATH%'); $s.TargetPath = '%VBS_PATH%'; $s.WorkingDirectory = '%~dp0'; $s.Save()" >nul 2>&1
if exist "%SHORTCUT_PATH%" (
    echo       [OK] Auto-starts whenever Windows boots up!
)

:: 2. Add Windows Task Scheduler task (runs on user logon with highest priority)
echo [2/4] Registering Windows Scheduled Task (24/7 Watchdog)...
schtasks /create /tn "KeaPrintAgentWatchdog" /tr "wscript.exe \"%VBS_PATH%\"" /sc onlogon /rl highest /f >nul 2>&1
echo       [OK] Task Scheduler entry registered!

:: 3. Register keaprint:// URL Protocol so the web software can auto-run the agent directly from the browser!
echo [3/4] Registering keaprint:// Browser Protocol...
reg add "HKCU\Software\Classes\keaprint" /ve /d "URL:Kea Print Agent Protocol" /f >nul 2>&1
reg add "HKCU\Software\Classes\keaprint" /v "URL Protocol" /d "" /f >nul 2>&1
reg add "HKCU\Software\Classes\keaprint\shell\open\command" /ve /d "wscript.exe \"%VBS_PATH%\"" /f >nul 2>&1
echo       [OK] Browser URL protocol 'keaprint://' registered!

:: 4. Start the 24/7 Watchdog now in the background
echo [4/4] Starting 24/7 Watchdog now in background...
start "" wscript "%VBS_PATH%"

echo.
echo ====================================================
echo  [SUCCESS] Kea Print Agent 24/7 Watchdog is ACTIVE!
echo.
echo  - Checks status every 2 seconds.
echo  - If it stops or crashes, restarts immediately in 2s.
echo  - Auto-starts on PC restart / user login.
echo  - Automatically connects to https://keabythepool.com
echo ====================================================
echo.
pause

