@echo off
title Kea Print Agent - Permanent Auto-Start Setup
cd /d "%~dp0"
set "PATH=%PATH%;C:\Program Files\nodejs;C:\Program Files (x86)\nodejs;%LOCALAPPDATA%\Programs\nodejs;%USERPROFILE%\AppData\Local\Programs\nodejs;%APPDATA%\npm"

REM Request Administrator elevation if needed so Registry and Scheduled Tasks succeed
net session >nul 2>&1
if %errorlevel% neq 0 (
    if not "%1"=="--no-elevate" (
        echo ====================================================
        echo   Requesting Administrator permission...
        echo   Click 'Yes' on the Windows prompt to enable 
        echo   permanent auto-start on every PC boot!
        echo ====================================================
        powershell -NoProfile -Command "Start-Process cmd.exe -ArgumentList '/k \"\"%~f0\"\" --no-elevate' -Verb RunAs"
        exit /b 0
    )
)

echo ====================================================
echo   Kea Print Agent - Permanent Auto-Start Setup
echo ====================================================
echo   Folder: %~dp0
echo.

where node >nul 2>&1
if errorlevel 1 goto :no_node

set "VBS_PATH=%~dp0run-hidden.vbs"
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "COMMON_STARTUP=%ProgramData%\Microsoft\Windows\Start Menu\Programs\Startup"

REM ----------------------------------------------------
REM LAYER 1: Windows Registry Run Key (User)
REM ----------------------------------------------------
echo [1/4] Registering in Windows Registry Run key...
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "KeaPrintAgent" /t REG_SZ /d "wscript.exe \"%VBS_PATH%\"" /f >nul 2>&1
echo       [OK] Registry (Current User) auto-run registered!

REM ----------------------------------------------------
REM LAYER 2: Windows Startup Folder (.cmd Launcher)
REM ----------------------------------------------------
echo [2/4] Registering in Windows Startup folder...
if not exist "%STARTUP_FOLDER%" mkdir "%STARTUP_FOLDER%" >nul 2>&1
del /f /q "%STARTUP_FOLDER%\KeaPrintAgent.vbs" >nul 2>&1
del /f /q "%STARTUP_FOLDER%\KeaPrintAgent.lnk" >nul 2>&1
del /f /q "%STARTUP_FOLDER%\KeaPrintAgent.cmd" >nul 2>&1

> "%STARTUP_FOLDER%\KeaPrintAgent.cmd" echo @echo off
>> "%STARTUP_FOLDER%\KeaPrintAgent.cmd" echo cd /d "%~dp0"
>> "%STARTUP_FOLDER%\KeaPrintAgent.cmd" echo start "" wscript.exe "%VBS_PATH%"
>> "%STARTUP_FOLDER%\KeaPrintAgent.cmd" echo exit /b 0

REM If Common Startup exists, copy there too
if exist "%COMMON_STARTUP%" (
    copy /y "%STARTUP_FOLDER%\KeaPrintAgent.cmd" "%COMMON_STARTUP%\KeaPrintAgent.cmd" >nul 2>&1
)
echo       [OK] Startup folder auto-launcher installed!

REM ----------------------------------------------------
REM LAYER 3: Windows Task Scheduler (On-Logon Task)
REM ----------------------------------------------------
echo [3/4] Registering Windows Scheduled Tasks...
REM Remove any old conflicting SYSTEM boot tasks
schtasks /delete /tn "KeaPrintAgentBoot" /f >nul 2>&1
schtasks /delete /tn "KeaPrintAgentWatchdog" /f >nul 2>&1

REM Trigger on User Logon with highest privileges
schtasks /create /tn "KeaPrintAgentWatchdog" /tr "wscript.exe \"%VBS_PATH%\"" /sc onlogon /rl highest /f >nul 2>&1
if errorlevel 1 (
    schtasks /create /tn "KeaPrintAgentWatchdog" /tr "wscript.exe \"%VBS_PATH%\"" /sc onlogon /f >nul 2>&1
)
echo       [OK] Task Scheduler Logon task registered!

REM ----------------------------------------------------
REM LAYER 4: Prevent PC Sleep (Keep Thermal Printers Ready)
REM ----------------------------------------------------
echo [4/4] Configuring Power Settings (Sleep: Never while plugged in)...
powercfg /change standby-timeout-ac 0 >nul 2>&1
powercfg /change hibernate-timeout-ac 0 >nul 2>&1
powercfg /change monitor-timeout-ac 30 >nul 2>&1
echo       [OK] PC sleep disabled while plugged in.

REM ----------------------------------------------------
REM START SERVICE NOW
REM ----------------------------------------------------
echo.
echo Starting 24/7 Agent Daemon in background...
start "" wscript "%VBS_PATH%"
ping 127.0.0.1 -n 3 >nul 2>&1

echo.
echo ====================================================
echo  [SUCCESS] Permanent Auto-Start is ACTIVE!
echo ====================================================
echo.
echo  The Kea Print Agent will now start automatically
echo  EVERY time the PC turns on or reboots.
echo.
echo  - Registry Run:     ENABLED
echo  - Startup Folder:   ENABLED
echo  - Task Scheduler:   ENABLED
echo  - Auto-restart:     ENABLED (Restarts in 2s if closed)
echo.
echo  AAPKO ROJ MANUALLY START KARNE KI KOI ZARURAT NAHI HAI!
echo  PC on hote hi agent background mein apne aap chalega.
echo ====================================================
echo.
echo Press any key to close this window...
pause >nul
exit /b 0

:no_node
echo [ERROR] Node.js is not installed on this PC.
echo         Install Node.js LTS from https://nodejs.org and run this file again.
echo.
echo Press any key to close...
pause >nul
exit /b 1
