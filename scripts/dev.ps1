#Requires -Version 5.1
<#
    VOXSHIFT — start the CPU engine and the Studio together on Windows.

        .\scripts\dev.ps1                  # engine :8000, studio :3000
        .\scripts\dev.ps1 -StudioPort 3010 # different ports

    If PowerShell refuses to run scripts, use either of these once:
        Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
        powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1

    Stop everything with Ctrl-C.
#>
[CmdletBinding()]
param(
    [int]$EnginePort = 8000,
    [int]$StudioPort = 3000
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function Find-Python {
    foreach ($candidate in @('python', 'py')) {
        $command = Get-Command $candidate -ErrorAction SilentlyContinue
        if ($command) { return $command.Source }
    }
    throw 'Python 3.10+ is required for the engine. Install it from python.org and re-run.'
}

$python = Find-Python
$npm = Get-Command 'npm.cmd' -ErrorAction SilentlyContinue
if (-not $npm) { $npm = Get-Command 'npm' -ErrorAction SilentlyContinue }
if (-not $npm) { throw 'Node.js 18+ is required for the studio. Install it from nodejs.org and re-run.' }

if (-not (Test-Path (Join-Path $root 'frontend\node_modules'))) {
    Write-Host 'Installing frontend dependencies (first run, takes a minute)…'
    Push-Location (Join-Path $root 'frontend'); npm install --no-fund --no-audit; Pop-Location
}

& $python -c "import numpy, fastapi, uvicorn" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Installing engine dependencies…'
    & $python -m pip install -r (Join-Path $root 'backend\requirements.txt')
}

$env:ENGINE_URL = "http://127.0.0.1:$EnginePort"
Write-Host ">  engine  http://127.0.0.1:$EnginePort  (docs at /docs)"
$engine = Start-Process -FilePath $python `
    -ArgumentList @('-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', "$EnginePort") `
    -WorkingDirectory (Join-Path $root 'backend') -NoNewWindow -PassThru

Write-Host ">  studio  http://127.0.0.1:$StudioPort"
$env:PORT = "$StudioPort"
$studio = Start-Process -FilePath $npm.Source -ArgumentList @('run', 'dev') `
    -WorkingDirectory (Join-Path $root 'frontend') -NoNewWindow -PassThru

Write-Host ''
Write-Host "Open http://localhost:$StudioPort in your browser. Press Ctrl-C to stop both."

try {
    while (-not $engine.HasExited -and -not $studio.HasExited) { Start-Sleep -Milliseconds 500 }
} finally {
    Write-Host ''
    Write-Host 'Stopping…'
    foreach ($process in @($engine, $studio)) {
        if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
    }
}
