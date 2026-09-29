@echo off
title Kea Print Agent (Auto-Restart Loop)
cd /d "%~dp0"
set "PATH=%PATH%;C:\Program Files\nodejs;C:\Program Files (x86)\nodejs;%LOCALAPPDATA%\Programs\nodejs;%USERPROFILE%\AppData\Local\Programs\nodejs;%APPDATA%\npm"
set SERVER_URL=https://keabythepool.com

echo [%date% %time%] Kea Print Agent loop started. >> "%~dp0agent-runtime.log" 2>&1

:loop
echo [%date% %time%] Starting Kea Print Agent process... >> "%~dp0agent-runtime.log" 2>&1
node agent.js >> "%~dp0agent-runtime.log" 2>&1
echo [%date% %time%] Print Agent exited with code %ERRORLEVEL%. Restarting in 5 seconds... >> "%~dp0agent-runtime.log" 2>&1
ping 127.0.0.1 -n 6 >nul
goto loop