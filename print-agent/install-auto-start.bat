@echo off
set "PATH=%PATH%;C:\Program Files\nodejs;C:\Program Files (x86)\nodejs;%LOCALAPPDATA%\Programs\nodejs"
title Kea Print Agent - Auto Start Setup
echo ====================================================
echo   Setting up Kea Print Agent to run on PC Startup
echo ====================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed on this PC!
    echo Please download and install Node.js from: https://nodejs.org
    echo (Choose LTS version and finish installation first)
    echo.
    pause
    exit /b 1
)

set AGENT_DIR=%~dp0
set VBS_TARGET=%AGENT_DIR%run-hidden.vbs
set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set SHORTCUT_LNK=%STARTUP_DIR%\KeaPrintAgent.lnk

echo Creating startup shortcut in Windows Startup folder...
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_LNK%'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"%VBS_TARGET%\"'; $s.WorkingDirectory = '%AGENT_DIR%'; $s.Save()"

echo.
echo ====================================================
echo [SUCCESS] Auto-start configured successfully!
echo The agent will now run silently in background forever.
echo It will automatically start whenever the PC boots up.
echo ====================================================
echo.
echo Starting Print Agent now in background...
start "" wscript "%VBS_TARGET%"
echo Agent is running! You can close this window.
echo.
pause
