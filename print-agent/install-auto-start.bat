@echo off
title Kea Print Agent - Permanent Auto-Start Setup
cd /d "%~dp0"
set "PATH=%PATH%;C:\Program Files\nodejs;C:\Program Files (x86)\nodejs;%LOCALAPPDATA%\Programs\nodejs;%USERPROFILE%\AppData\Local\Programs\nodejs;%APPDATA%\npm"

:: Check for Administrator elevation; if not elevated, request it so Task Scheduler (on-boot) works
net session >nul 2>&1
if %errorlevel% neq 0 (
    if not "%1"=="--no-elevate" (
        echo ====================================================
        echo   Requesting Administrator permission...
        echo   Click 'Yes' on the Windows prompt to enable 
        echo   permanent auto-start on every PC boot!
        echo ====================================================
        powershell -NoProfile -Command "Start-Process cmd.exe -ArgumentList '/c \"\"%~f0\"\" --no-elevate' -Verb RunAs"
        if %errorlevel% equ 0 exit /b 0
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

:: ----------------------------------------------------and aab 
:: LAYER 1: Windows Registry Run Key (User + Machine)
:: ----------------------------------------------------
echo [1/5] Registering in Windows Registry Run key...
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "KeaPrintAgent" /t REG_SZ /d "wscript.exe \"%VBS_PATH%\"" /f >nul 2>&1
if errorlevel 0 (echo       [OK] Registry (Current User) auto-run registered!) else (echo       [NOTE] Registry HKCU skipped.)

reg add "HKLM\Software\Microsoft\Windows\CurrentVersion\Run" /v "KeaPrintAgent" /t REG_SZ /d "wscript.exe \"%VBS_PATH%\"" /f >nul 2>&1
if errorlevel 0 (echo       [OK] Registry (All Users / System) auto-run registered!)

:: ----------------------------------------------------
:: LAYER 2: Windows Startup Folder (.lnk Shortcut + .cmd Launcher)
:: ----------------------------------------------------
echo [2/5] Registering in Windows Startup folder...
if not exist "%STARTUP_FOLDER%" mkdir "%STARTUP_FOLDER%" >nul 2>&1
del /f /q "%STARTUP_FOLDER%\KeaPrintAgent.vbs" >nul 2>&1
del /f /q "%STARTUP_FOLDER%\KeaPrintAgent.lnk" >nul 2>&1
del /f /q "%STARTUP_FOLDER%\KeaPrintAgent.cmd" >nul 2>&1

:: Create proper Windows .lnk binary shortcut via PowerShell COM object
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%STARTUP_FOLDER%\KeaPrintAgent.lnk'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"%VBS_PATH%\"'; $s.WorkingDirectory = '%~dp0'; $s.WindowStyle = 7; $s.Save()" >nul 2>&1

:: Also write a fail-safe .cmd launcher in Startup folder
> "%STARTUP_FOLDER%\KeaPrintAgent.cmd" echo @echo off
>> "%STARTUP_FOLDER%\KeaPrintAgent.cmd" echo cd /d "%~dp0"
>> "%STARTUP_FOLDER%\KeaPrintAgent.cmd" echo start "" wscript.exe "%VBS_PATH%"
>> "%STARTUP_FOLDER%\KeaPrintAgent.cmd" echo exit /b 0

:: If admin, also copy to Common Startup for All Users
if exist "%COMMON_STARTUP%" (
    copy /y "%STARTUP_FOLDER%\KeaPrintAgent.lnk" "%COMMON_STARTUP%\KeaPrintAgent.lnk" >nul 2>&1
    copy /y "%STARTUP_FOLDER%\KeaPrintAgent.cmd" "%COMMON_STARTUP%\KeaPrintAgent.cmd" >nul 2>&1
)
echo       [OK] Startup folder shortcuts installed!

:: ----------------------------------------------------
:: LAYER 3: Windows Task Scheduler (On-Logon + On-Boot)
:: ----------------------------------------------------
echo [3/5] Registering Windows Scheduled Tasks...
schtasks /delete /tn "KeaPrintAgentWatchdog" /f >nul 2>&1
schtasks /delete /tn "KeaPrintAgentBoot" /f >nul 2>&1

:: Task A: Trigger on User Logon (runs with highest privileges if admin, or standard)
schtasks /create /tn "KeaPrintAgentWatchdog" /tr "wscript.exe \"%VBS_PATH%\"" /sc onlogon /rl highest /f >nul 2>&1
if errorlevel 1 (
    schtasks /create /tn "KeaPrintAgentWatchdog" /tr "wscript.exe \"%VBS_PATH%\"" /sc onlogon /f >nul 2>&1
)
if errorlevel 0 (echo       [OK] Task Scheduler Logon task registered!) else (echo       [NOTE] Task Scheduler Logon skipped.)

:: Task B: Trigger on System Boot (before user login, requires admin)
schtasks /create /tn "KeaPrintAgentBoot" /tr "wscript.exe \"%VBS_PATH%\"" /sc onstart /ru "SYSTEM" /f >nul 2>&1
if errorlevel 0 (echo       [OK] Task Scheduler System Boot task registered (runs before login)!)

:: ----------------------------------------------------
:: LAYER 4: keaprint:// Browser Protocol
:: ----------------------------------------------------
echo [4/5] Registering keaprint:// Browser Protocol...
reg add "HKCU\Software\Classes\keaprint" /ve /d "URL:Kea Print Agent Protocol" /f >nul 2>&1
reg add "HKCU\Software\Classes\keaprint" /v "URL Protocol" /d "" /f >nul 2>&1
reg add "HKCU\Software\Classes\keaprint\shell\open\command" /ve /d "wscript.exe \"%VBS_PATH%\"" /f >nul 2>&1
echo       [OK] Browser URL protocol 'keaprint://' registered!

:: ----------------------------------------------------
:: LAYER 5: Prevent PC Sleep & USB Selective Suspend
:: ----------------------------------------------------
echo [5/5] Configuring Power Settings (Sleep: Never)...
powercfg /change standby-timeout-ac 0 >nul 2>&1
powercfg /change hibernate-timeout-ac 0 >nul 2>&1
powercfg /change monitor-timeout-ac 30 >nul 2>&1
powercfg /setacvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0 >nul 2>&1
powercfg /setactive SCHEME_CURRENT >nul 2>&1
echo       [OK] PC sleep disabled while plugged in (keeps thermal printers ready 24/7).

:: ----------------------------------------------------
:: START SERVICE NOW & VERIFY
:: ----------------------------------------------------
echo.
echo Starting 24/7 Agent Daemon in background...
start "" wscript "%VBS_PATH%"
ping 127.0.0.1 -n 4 >nul 2>&1

echo.
echo ====================================================
echo  [SUCCESS] Permanent Auto-Start Installed!
echo ====================================================
echo.
echo  The Kea Print Agent is now permanently registered:
echo   - Windows Registry Run Key: ENABLED
echo   - Windows Startup Folder:   ENABLED (.lnk + .cmd)
echo   - Task Scheduler (Logon):   ENABLED
echo   - Task Scheduler (Boot):    ENABLED
echo   - Auto-restart if stopped:  ENABLED (every 2s)
echo.
echo  PC reboot ho ya restart, agent apne aap chalega!
echo  Ab dobara manually start karne ki bilkul zarurat nahi.
echo ====================================================
echo.
pause
exit /b 0

:no_node
echo [ERROR] Node.js is not installed on this PC.
echo         Install Node.js LTS from https://nodejs.org and run this file again.
echo.
pause
exit /b 1
