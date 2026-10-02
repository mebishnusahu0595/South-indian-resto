@echo off
title Kea Print Agent - 24/7 Auto Start ^& Protocol Setup
cd /d "%~dp0"
set "PATH=%PATH%;C:\Program Files\nodejs;C:\Program Files (x86)\nodejs;%LOCALAPPDATA%\Programs\nodejs;%USERPROFILE%\AppData\Local\Programs\nodejs;%APPDATA%\npm"

echo ====================================================
echo   Kea Print Agent - 24/7 Auto Start ^& Auto-Run Setup
echo ====================================================
echo   Folder: %~dp0
echo.

where node >nul 2>&1
if errorlevel 1 goto :no_node

set "VBS_PATH=%~dp0run-hidden.vbs"
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "STARTUP_VBS=%STARTUP_FOLDER%\KeaPrintAgent.vbs"

:: 1. Windows Startup folder: a tiny launcher script (no PowerShell needed). Old shortcut removed.
echo [1/4] Registering in Windows Startup folder...
del /f /q "%STARTUP_FOLDER%\KeaPrintAgent.lnk" >nul 2>&1
> "%STARTUP_VBS%" echo CreateObject("WScript.Shell").Run "wscript.exe ""%VBS_PATH%""", 0, False
if exist "%STARTUP_VBS%" (echo       [OK] Auto-starts whenever Windows boots up!) else (echo       [ERROR] Could not write to the Startup folder.)

:: 2. Task Scheduler backup (needs admin). If both start at login, the newest takes over: still one agent.
echo [2/4] Registering Windows Scheduled Task...
schtasks /create /tn "KeaPrintAgentWatchdog" /tr "wscript.exe \"%VBS_PATH%\"" /sc onlogon /rl highest /f >nul 2>&1
if errorlevel 1 (echo       [SKIPPED] Needs Run as administrator - the Startup folder entry is enough.) else (echo       [OK] Task Scheduler entry registered!)

:: 3. keaprint:// URL protocol so the web software can start the agent from the browser.
echo [3/4] Registering keaprint:// Browser Protocol...
reg add "HKCU\Software\Classes\keaprint" /ve /d "URL:Kea Print Agent Protocol" /f >nul 2>&1
reg add "HKCU\Software\Classes\keaprint" /v "URL Protocol" /d "" /f >nul 2>&1
reg add "HKCU\Software\Classes\keaprint\shell\open\command" /ve /d "wscript.exe \"%VBS_PATH%\"" /f >nul 2>&1
if errorlevel 1 (echo       [ERROR] Could not register keaprint://) else (echo       [OK] Browser URL protocol 'keaprint://' registered!)

:: A sleeping PC or a suspended USB port prints KOTs late (agent paused, WiFi/USB dropped): keep it awake.
echo [+] Keeping this PC awake for printing...
powercfg /change standby-timeout-ac 0 >nul 2>&1
powercfg /change hibernate-timeout-ac 0 >nul 2>&1
powercfg /setacvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0 >nul 2>&1
powercfg /setactive SCHEME_CURRENT >nul 2>&1
if errorlevel 1 (echo       [SKIPPED] Set Sleep to Never by hand: Settings - System - Power) else (echo       [OK] Sleep: Never, USB power saving: Off)

:: 4. Start now (it stops any older agent first), then check it is really listening.
echo [4/4] Starting 24/7 Watchdog now in background...
start "" wscript "%VBS_PATH%"
ping 127.0.0.1 -n 10 >nul 2>&1
netstat -ano | findstr /R /C:":39281 .*LISTENING" >nul 2>&1
if errorlevel 1 goto :not_running

echo.
echo ====================================================
echo  [SUCCESS] Kea Print Agent 24/7 Watchdog is RUNNING!
echo.
echo  - Only one agent runs: a new start stops the old one.
echo  - If it stops or crashes, restarts immediately in 2s.
echo  - Auto-starts on PC restart / user login.
echo  - Automatically connects to https://keabythepool.com
echo ====================================================
echo.
pause
exit /b 0

:not_running
echo.
echo [ERROR] The background agent did not start. Starting it in this window to show the reason.
echo         Keep this window open, or send a screenshot of it.
echo.
call "%~dp0start-agent.bat"
exit /b 1

:no_node
echo [ERROR] Node.js is not installed on this PC.
echo         Install Node.js LTS from https://nodejs.org and run this file again.
echo.
pause
exit /b 1
