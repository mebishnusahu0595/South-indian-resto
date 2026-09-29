@echo off
title Kea Print Agent - 24/7 Background Watchdog
cd /d "%~dp0"

echo ====================================================
echo   Kea Print Agent - Launching 24/7 Watchdog
echo ====================================================
echo.
echo Starting hidden watchdog (checks every 2s, auto-restarts)...
start "" wscript "%~dp0run-hidden.vbs"

:: Also ensure auto-start on boot is installed
call "%~dp0install-auto-start.bat"
