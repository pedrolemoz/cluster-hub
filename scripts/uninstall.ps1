#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Uninstalls Cluster Hub Agent.
  Usage: irm https://domain.com/uninstall.ps1 | iex
#>

$ErrorActionPreference = "Stop"

$ServiceName = "ClusterHubAgent"
$InstallDir  = "C:\Program Files\ClusterHub"

Write-Host ""
Write-Host "=== Cluster Hub Agent Uninstaller ===" -ForegroundColor Yellow
Write-Host ""

$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue

if (-not $svc) {
    Write-Host "Service '$ServiceName' not found — nothing to remove." -ForegroundColor Gray
} else {
    if ($svc.Status -eq "Running") {
        Write-Host "Stopping service..."
        sc.exe stop $ServiceName
        Start-Sleep -Seconds 3
    }
    Write-Host "Removing service..."
    sc.exe delete $ServiceName
    Start-Sleep -Seconds 1
    Write-Host "Service removed."
}

if (Test-Path $InstallDir) {
    Write-Host "Removing files from $InstallDir ..."
    Remove-Item -Path $InstallDir -Recurse -Force
    Write-Host "Files removed."
} else {
    Write-Host "Install directory not found — nothing to delete." -ForegroundColor Gray
}

Write-Host ""
Write-Host "Cluster Hub Agent uninstalled." -ForegroundColor Green
Write-Host ""
