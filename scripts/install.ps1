#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Installs Cluster Hub Agent as a Windows service.
  Usage: irm https://domain.com/install.ps1 | iex
#>

$ErrorActionPreference = "Stop"

$ServiceName  = "ClusterHubAgent"
$DisplayName  = "Cluster Hub Agent"
$InstallDir   = "C:\Program Files\ClusterHub"
$BinaryPath   = "$InstallDir\cluster-hub-agent.exe"
$DownloadUrl  = "https://domain.com/releases/latest/windows/cluster-hub-agent.exe"

Write-Host ""
Write-Host "=== Cluster Hub Agent Installer ===" -ForegroundColor Cyan
Write-Host ""

# Create install directory
Write-Host "Creating $InstallDir ..."
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

# Download binary
Write-Host "Downloading agent from $DownloadUrl ..."
Invoke-WebRequest -Uri $DownloadUrl -OutFile $BinaryPath -UseBasicParsing

# Stop + remove old service if it exists
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Removing existing service..."
    if ($existing.Status -eq "Running") {
        sc.exe stop $ServiceName | Out-Null
        Start-Sleep -Seconds 2
    }
    sc.exe delete $ServiceName | Out-Null
    Start-Sleep -Seconds 1
}

# Register service
Write-Host "Registering Windows service..."
sc.exe create $ServiceName binPath= "`"$BinaryPath`"" start= auto DisplayName= "`"$DisplayName`"" | Out-Null
sc.exe description $ServiceName "Cluster Hub monitoring agent (health, metrics, shutdown)" | Out-Null
sc.exe failure $ServiceName reset= 60 actions= restart/5000/restart/10000/restart/30000 | Out-Null

# Start service
Write-Host "Starting service..."
sc.exe start $ServiceName | Out-Null

Start-Sleep -Seconds 2
$status = (Get-Service -Name $ServiceName).Status
Write-Host ""
Write-Host "Done! Service status: $status" -ForegroundColor Green
Write-Host "Agent runs on port 8080 by default."
Write-Host ""
Write-Host "Manage:"
Write-Host "  Start:     sc.exe start $ServiceName"
Write-Host "  Stop:      sc.exe stop $ServiceName"
Write-Host "  Uninstall: irm https://domain.com/uninstall.ps1 | iex"
Write-Host ""
