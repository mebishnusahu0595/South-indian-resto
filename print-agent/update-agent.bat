@echo off
title Kea Print Agent - Quick Update
cd /d "%~dp0"

echo ====================================================
echo   Kea Print Agent - Updating to Latest Version
echo ====================================================
echo.

echo 1. Stopping running agent...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM wscript.exe >nul 2>&1

echo 2. Downloading latest agent.js from server...
if exist "%SystemRoot%\System32\curl.exe" (
    "%SystemRoot%\System32\curl.exe" -s -f -m 10 "https://keabythepool.com/agent.js" -o "%~dp0agent.js.new"
) else (
    powershell -NoProfile -Command "(New-Object Net.WebClient).DownloadFile('https://keabythepool.com/agent.js', '%~dp0agent.js.new')"
)

if exist "%~dp0agent.js.new" (
    for %%F in ("%~dp0agent.js.new") do (
        if %%~zF gtr 5000 (
            move /y "%~dp0agent.js.new" "%~dp0agent.js" >nul
            echo [SUCCESS] agent.js updated successfully!
        ) else (
            echo [ERROR] Downloaded file too small. Keeping existing agent.js.
            del /f /q "%~dp0agent.js.new" >nul 2>&1
        )
    )
) else (
    echo [ERROR] Download failed. Check your internet connection.
)

:: Also update install-auto-start.bat if reachable
if exist "%SystemRoot%\System32\curl.exe" (
    "%SystemRoot%\System32\curl.exe" -s -f -m 10 "https://keabythepool.com/install-auto-start.bat" -o "%~dp0install-auto-start.bat.new" >nul 2>&1
)
if exist "%~dp0install-auto-start.bat.new" (
    move /y "%~dp0install-auto-start.bat.new" "%~dp0install-auto-start.bat" >nul 2>&1
)

echo.
echo 3. Starting 24/7 Agent...
call "%~dp0START-AGENT-24X7.bat"

echo.
echo ====================================================
echo   Update completed! Agent is now running 24/7.
echo ====================================================
pause
