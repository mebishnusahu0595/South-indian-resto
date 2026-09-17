@echo off
title Kea Print Agent - Auto Start Setup
cd /d "%~dp0"
set "PATH=%PATH%;C:\Program Files\nodejs;C:\Program Files (x86)\nodejs;%LOCALAPPDATA%\Programs\nodejs;%APPDATA%\npm"

echo ====================================================
echo   Setting up Kea Print Agent to run on PC Startup
echo ====================================================
echo.

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
