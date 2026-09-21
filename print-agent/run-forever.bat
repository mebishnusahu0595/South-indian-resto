@echo off
title Kea Print Agent (Auto-Restart Loop)
cd /d "%~dp0"
set "PATH=%PATH%;C:\Program Files\nodejs;C:\Program Files (x86)\nodejs;%LOCALAPPDATA%\Programs\nodejs;%APPDATA%\npm"
set SERVER_URL=https://keabythepool.com

:loop
echo [%date% %time%] Starting Kea Print Agent...
node agent.js
echo [%date% %time%] Print Agent exited. Restarting in 5 seconds...
timeout /t 5 >nul
goto loop