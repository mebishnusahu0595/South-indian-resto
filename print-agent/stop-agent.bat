@echo off
title Stop Kea Print Agent ^& Watchdog
cd /d "%~dp0"

echo Stopping Kea Print Agent and 24/7 Watchdog processes...
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*agent.js*' -or $_.CommandLine -like '*watchdog.bat*' -or $_.CommandLine -like '*run-forever*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1
taskkill /F /IM node.exe /FI "WINDOWTITLE eq Kea Print Agent*" >nul 2>&1
taskkill /F /IM cmd.exe /FI "WINDOWTITLE eq Kea Print Agent*" >nul 2>&1
echo [OK] Print Agent and 24/7 Watchdog stopped.
pause

