#Requires -RunAsAdministrator
$ErrorActionPreference = "Continue"

Write-Host "Stopping and removing Scheduled Tasks..." -ForegroundColor Cyan
schtasks /end /tn "ClusterHubBackend" 2>$null
schtasks /delete /tn "ClusterHubBackend" /f 2>$null

schtasks /end /tn "ClusterHubFrontend" 2>$null
schtasks /delete /tn "ClusterHubFrontend" /f 2>$null

$installDir = "C:\ClusterHubDev"
if (Test-Path $installDir) {
    Write-Host "Terminating background processes..." -ForegroundColor Cyan
    # Kill node, go, and powershell processes associated with this installation
    Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match "ClusterHubDev" } | Invoke-CimMethod -MethodName Terminate | Out-Null
    Start-Sleep -Seconds 2

    Write-Host "Removing directory $installDir..." -ForegroundColor Cyan
    Remove-Item -Path $installDir -Recurse -Force
}

Write-Host "Uninstallation complete." -ForegroundColor Green
