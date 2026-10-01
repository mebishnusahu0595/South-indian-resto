Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "  Kea Print Agent - Auto Updating to Latest Version " -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# 1. Stop old agent processes
Write-Host "Stopping running agent processes..." -ForegroundColor Yellow
Stop-Process -Name node,wscript -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# 2. Find agent directory
$dir = $null
$reg = (Get-ItemProperty 'HKCU:\Software\Classes\keaprint\shell\open\command' -ErrorAction SilentlyContinue).'(default)'
if ($reg -and ($reg -match '"([^"]+run-hidden\.vbs)"')) {
    $dir = Split-Path $matches[1]
}

if (-not $dir -or -not (Test-Path "$dir\agent.js")) {
    $candidate = Get-ChildItem -Path "$HOME\Downloads", "$HOME\Desktop", "C:\" -Filter "agent.js" -Recurse -Depth 4 -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($candidate) {
        $dir = $candidate.DirectoryName
    }
}

if (-not $dir) {
    $dir = "$HOME\Downloads\kea-print-agent"
}

Write-Host "Agent folder: $dir" -ForegroundColor Green

# 3. Download latest agent.js
Write-Host "Downloading latest agent.js..." -ForegroundColor Yellow
$dest = Join-Path $dir "agent.js"
Invoke-WebRequest -Uri "https://keabythepool.com/agent.js" -OutFile "$dest.new" -UseBasicParsing

if ((Test-Path "$dest.new") -and (Get-Item "$dest.new").Length -gt 5000) {
    Move-Item -Path "$dest.new" -Destination $dest -Force
    Write-Host "[SUCCESS] agent.js updated successfully!" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Could not download agent.js. Please check internet connection." -ForegroundColor Red
    return
}

# 4. Start agent 24/7 watchdog
Write-Host "Starting 24/7 Agent Watchdog..." -ForegroundColor Yellow
if (Test-Path "$dir\run-hidden.vbs") {
    Start-Process wscript.exe -ArgumentList "`"$dir\run-hidden.vbs`"" -WorkingDirectory $dir
} elseif (Test-Path "$dir\START-AGENT-24X7.bat") {
    Start-Process "$dir\START-AGENT-24X7.bat" -WorkingDirectory $dir
} else {
    Start-Process node.exe -ArgumentList "agent.js" -WorkingDirectory $dir
}

Start-Sleep -Seconds 2
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "  Update complete! Agent is running in background.   " -ForegroundColor Green
Write-Host "  Please refresh the Settings page now.              " -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan
