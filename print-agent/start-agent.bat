@echo off
title Kea By The Pool - Print Agent
echo ====================================================
echo   Kea By The Pool - Restaurant Print Agent
echo ====================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed on this PC!
    echo.
    echo Please install Node.js:
    echo 1. Download LTS from: https://nodejs.org
    echo 2. Run the installer (keep default settings)
    echo 3. Re-run this file (start-agent.bat)
    echo.
    pause
    exit /b 1
)

set SERVER_URL=https://keabythepool.com

if not exist node_modules (
    echo Installing dependencies (first time only)...
    call npm install
)

echo Starting Print Agent...
echo Connecting to https://keabythepool.com ...
echo Keep this window open in background for automatic printing!
echo.
node agent.js
pause
