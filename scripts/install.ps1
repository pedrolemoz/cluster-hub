#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Installs Cluster Hub backend + frontend web UI as Windows services.
  Usage: irm https://raw.githubusercontent.com/pedrolemoz/cluster-hub/main/scripts/install.ps1 | iex
#>

$ErrorActionPreference = "Stop"

$HubServiceName      = "ClusterHubBackend"
$FrontendServiceName = "ClusterHubFrontend"
$InstallDir          = "C:\Program Files\ClusterHub"
$HubBinaryPath       = "$InstallDir\cluster-hub-agent.exe"
$FrontendDir         = "$InstallDir\frontend"

Write-Host ""
Write-Host "=== Cluster Hub Installer ===" -ForegroundColor Cyan
Write-Host ""

# Require Node.js 18+
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Error "node not found. Install Node.js 18+ from https://nodejs.org and re-run."
}
$nodeMajor = [int](& node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if ($nodeMajor -lt 18) {
    Write-Error "Node.js 18+ required (found $nodeMajor)"
}
Write-Host "Node.js $nodeMajor OK"

# Fetch latest release tag
Write-Host "Fetching latest release..."
$LatestTag   = (Invoke-RestMethod "https://api.github.com/repos/pedrolemoz/cluster-hub/releases/latest").tag_name
$BaseUrl     = "https://github.com/pedrolemoz/cluster-hub/releases/download/$LatestTag"
Write-Host "Latest release: $LatestTag"

# Create directories
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path $FrontendDir | Out-Null

# --- Download hub binary ---
Write-Host ""
Write-Host "Downloading hub backend..."
Invoke-WebRequest -Uri "$BaseUrl/cluster-hub-agent.exe" -OutFile $HubBinaryPath -UseBasicParsing
Write-Host "Saved to $HubBinaryPath"

# --- Download + extract frontend ---
Write-Host ""
Write-Host "Downloading frontend..."
$Tarball = "$env:TEMP\cluster-hub-frontend.tar.gz"
Invoke-WebRequest -Uri "$BaseUrl/cluster-hub-frontend.tar.gz" -OutFile $Tarball -UseBasicParsing
& tar -xzf $Tarball -C $FrontendDir
Remove-Item $Tarball
Write-Host "Extracted to $FrontendDir"

# --- Helper: stop + remove service if exists ---
function Remove-ServiceIfExists {
    param($Name)
    $svc = Get-Service -Name $Name -ErrorAction SilentlyContinue
    if ($svc) {
        Write-Host "Removing existing service $Name..."
        if ($svc.Status -eq "Running") { sc.exe stop $Name | Out-Null; Start-Sleep -Seconds 2 }
        sc.exe delete $Name | Out-Null
        Start-Sleep -Seconds 1
    }
}

Remove-ServiceIfExists $HubServiceName
Remove-ServiceIfExists $FrontendServiceName

# --- Register hub service ---
Write-Host "Registering hub backend service..."
sc.exe create $HubServiceName `
    binPath= "`"$HubBinaryPath`"" `
    start= auto `
    DisplayName= "Cluster Hub Backend" | Out-Null
sc.exe description $HubServiceName "Cluster Hub backend API server" | Out-Null
sc.exe failure $HubServiceName reset= 60 actions= restart/5000/restart/10000/restart/30000 | Out-Null

# Set environment variables for hub service via registry
$HubRegPath = "HKLM:\SYSTEM\CurrentControlSet\Services\$HubServiceName"
[string[]]$hubEnv = @(
    "PORT=3001",
    "DB_PATH=$InstallDir\cluster.db"
)
New-ItemProperty -Path $HubRegPath -Name "Environment" -PropertyType MultiString -Value $hubEnv -Force | Out-Null

# --- Register frontend service via node wrapper ---
$NodePath = (Get-Command node).Source
$FrontendServerPath = "$FrontendDir\server.js"

Write-Host "Registering frontend service..."
sc.exe create $FrontendServiceName `
    binPath= "`"$NodePath`" `"$FrontendServerPath`"" `
    start= auto `
    DisplayName= "Cluster Hub Frontend" | Out-Null
sc.exe description $FrontendServiceName "Cluster Hub Next.js web UI" | Out-Null
sc.exe failure $FrontendServiceName reset= 60 actions= restart/5000/restart/10000/restart/30000 | Out-Null

$FeRegPath = "HKLM:\SYSTEM\CurrentControlSet\Services\$FrontendServiceName"
[string[]]$feEnv = @(
    "PORT=3000",
    "HOSTNAME=0.0.0.0",
    "BACKEND_URL=http://localhost:3001"
)
New-ItemProperty -Path $FeRegPath -Name "Environment" -PropertyType MultiString -Value $feEnv -Force | Out-Null

# --- Start services ---
Write-Host "Starting services..."
sc.exe start $HubServiceName | Out-Null
Start-Sleep -Seconds 2
sc.exe start $FrontendServiceName | Out-Null
Start-Sleep -Seconds 2

$hubStatus = (Get-Service -Name $HubServiceName).Status
$feStatus  = (Get-Service -Name $FrontendServiceName).Status

Write-Host ""
Write-Host "Done!" -ForegroundColor Green
Write-Host "  Hub backend:  $hubStatus  (port 3001)"
Write-Host "  Frontend:     $feStatus  (port 3000)"
Write-Host ""
Write-Host "Open http://localhost:3000 in your browser."
Write-Host ""
Write-Host "Manage:"
Write-Host "  Start:     sc.exe start $HubServiceName; sc.exe start $FrontendServiceName"
Write-Host "  Stop:      sc.exe stop $HubServiceName; sc.exe stop $FrontendServiceName"
Write-Host "  Uninstall: irm https://raw.githubusercontent.com/pedrolemoz/cluster-hub/main/scripts/uninstall.ps1 | iex"
Write-Host ""
