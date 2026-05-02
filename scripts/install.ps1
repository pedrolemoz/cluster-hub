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
    # Attempt to kill processes from the existing install to avoid file lock errors
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

Write-Host "Creating Scheduled Tasks to run on system startup..." -ForegroundColor Cyan
# Create the tasks running as SYSTEM so they run even if no user is logged in
$backendCmd = "powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -Command `"cd $installDir\backend; .\main.exe`""
$frontendCmd = "powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -Command `"cd $installDir\frontend; npm start`""

schtasks /create /tn "ClusterHubBackend" /tr $backendCmd /sc onstart /ru SYSTEM /f
schtasks /create /tn "ClusterHubFrontend" /tr $frontendCmd /sc onstart /ru SYSTEM /f

Write-Host "Starting tasks now..." -ForegroundColor Cyan
schtasks /run /tn "ClusterHubBackend"
schtasks /run /tn "ClusterHubFrontend"

Write-Host ""
Write-Host "Installation complete! Cluster Hub will run automatically on startup." -ForegroundColor Green
Write-Host "Backend is available at: http://localhost:3001" -ForegroundColor Green
Write-Host "Frontend is available at: http://localhost:3000" -ForegroundColor Green
