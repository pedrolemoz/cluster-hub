# Start Cluster Hub (dev mode) — opens two separate terminal windows
# Usage: .\scripts\start.ps1

$scriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir  = Join-Path (Split-Path -Parent $scriptDir) "backend"
$frontendDir = Join-Path (Split-Path -Parent $scriptDir) "frontend"

Write-Host ""
Write-Host "=== Cluster Hub ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Opening backend window  (go run — wait for 'listening' before using the app)"
Write-Host "Opening frontend window (npm run dev)"
Write-Host ""

# Backend in its own window
Start-Process pwsh -ArgumentList @(
    "-NoExit",
    "-Command",
    "cd '$backendDir'; Write-Host 'Backend starting...' -ForegroundColor Cyan; go mod tidy; go run main.go"
)

# Frontend in its own window
Start-Process pwsh -ArgumentList @(
    "-NoExit",
    "-Command",
    "cd '$frontendDir'; Write-Host 'Frontend starting...' -ForegroundColor Cyan; npm install; npm run dev"
)

Write-Host "Backend  -> http://localhost:3001  (see backend window)"
Write-Host "Frontend -> http://localhost:3000  (see frontend window)"
Write-Host ""
Write-Host "Wait for backend window to show 'listening on...' before opening the browser."
