#Requires -Version 7
# Build cluster-hub-agent binaries for all supported platforms

$ErrorActionPreference = "Stop"

$BinaryName = "cluster-hub-agent"
$SrcDir     = Join-Path $PSScriptRoot "..\backend"
$OutDir     = Join-Path $PSScriptRoot "..\dist"

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Write-Host "Building from $SrcDir"
Write-Host "Output:       $OutDir"
Write-Host ""

function Build-Target {
    param($OS, $Arch, $GoArm, $OutName)

    $env:GOOS        = $OS
    $env:GOARCH      = $Arch
    $env:CGO_ENABLED = "0"
    if ($GoArm) { $env:GOARM = $GoArm } else { Remove-Item Env:\GOARM -ErrorAction SilentlyContinue }

    $out = Join-Path $OutDir $OutName
    & go build -trimpath -ldflags="-s -w" -o $out $SrcDir
    if ($LASTEXITCODE -ne 0) { throw "Build failed for $OutName" }
    Write-Host "  OK  $OutName"
}

Push-Location $SrcDir
try {
    Build-Target linux  amd64 $null "cluster-hub-agent-linux-amd64"
    Build-Target linux  arm64 $null "cluster-hub-agent-linux-arm64"
    Build-Target linux  arm   "7"   "cluster-hub-agent-linux-armv7"
    Build-Target windows amd64 $null "cluster-hub-agent.exe"
} finally {
    Pop-Location
    # Restore env
    Remove-Item Env:\GOOS, Env:\GOARCH, Env:\CGO_ENABLED -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Binaries written to dist/:"
Get-ChildItem $OutDir | Select-Object Name, @{N="Size";E={"{0:N0} KB" -f ($_.Length / 1KB)}}
