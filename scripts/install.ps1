#Requires -RunAsAdministrator
$ErrorActionPreference = "Stop"

Write-Host "Checking dependencies..." -ForegroundColor Cyan
$missing = @()
if (!(Get-Command "git" -ErrorAction SilentlyContinue)) { $missing += "git" }
if (!(Get-Command "go" -ErrorAction SilentlyContinue)) { $missing += "golang" }
if (!(Get-Command "node" -ErrorAction SilentlyContinue)) { $missing += "node.js" }
if (!(Get-Command "npm" -ErrorAction SilentlyContinue)) { $missing += "npm" }

if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Host "ERROR: Missing required dependencies: $($missing -join ', ')" -ForegroundColor Red
    Write-Host "Please install them and ensure they are in your system PATH before running this script." -ForegroundColor Yellow
    Write-Host "This script will not download them automatically." -ForegroundColor Yellow
    Exit 1
}

$installDir = "C:\ClusterHubDev"
if (Test-Path $installDir) {
    Write-Host "Removing existing installation at $installDir..." -ForegroundColor Yellow
    Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match "ClusterHubDev" } | Invoke-CimMethod -MethodName Terminate | Out-Null
    Start-Sleep -Seconds 2
    Remove-Item -Path $installDir -Recurse -Force
}

Write-Host "Cloning project to $installDir..." -ForegroundColor Cyan
git clone https://github.com/pedrolemoz/cluster-hub.git $installDir

Write-Host "Building Backend..." -ForegroundColor Cyan
Push-Location "$installDir\backend"
go mod tidy
go build -o main.exe
Pop-Location

Write-Host "Building Frontend..." -ForegroundColor Cyan
Push-Location "$installDir\frontend"
npm install
npm run build
Pop-Location

New-Item -ItemType Directory -Force -Path "$installDir\backend\web" | Out-Null
Copy-Item -Recurse -Force "$installDir\frontend\out\*" "$installDir\backend\web\"

Write-Host "Creating Scheduled Task to run on system startup..." -ForegroundColor Cyan
$backendCmd = "powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -Command `"cd $installDir\backend; .\main.exe`""

schtasks /create /tn "ClusterHubBackend" /tr $backendCmd /sc onstart /ru SYSTEM /f

Write-Host "Starting task now..." -ForegroundColor Cyan
schtasks /run /tn "ClusterHubBackend"

Write-Host ""
Write-Host "Installation complete! Cluster Hub will run automatically on startup." -ForegroundColor Green
Write-Host "Available at: http://localhost:3001" -ForegroundColor Green
