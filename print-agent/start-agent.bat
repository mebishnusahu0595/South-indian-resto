@echo off
title Kea By The Pool - Print Agent
cd /d "%~dp0"
set "PATH=%PATH%;C:\Program Files\nodejs;C:\Program Files (x86)\nodejs;%LOCALAPPDATA%\Programs\nodejs;%APPDATA%\npm"
set SERVER_URL=https://keabythepool.com

echo ====================================================
echo   Kea By The Pool - Restaurant Print Agent
echo ====================================================
echo.
echo Starting Print Agent...
echo Connecting to https://keabythepool.com ...
echo.

node agent.js
pause
