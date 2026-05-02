#Requires -Version 7
# Build cluster-hub-agent binaries and frontend for all supported platforms

$ErrorActionPreference = "Stop"

$BinaryName  = "cluster-hub-agent"
$RootDir     = Join-Path $PSScriptRoot ".."
$SrcDir      = Join-Path $RootDir "backend"
$FrontendDir = Join-Path $RootDir "frontend"
$OutDir      = Join-Path $RootDir "dist"

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Write-Host "Output: $OutDir"
Write-Host ""

# --- Go binaries ---
Write-Host "=== Building Go binaries ==="

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
    Remove-Item Env:\GOOS, Env:\GOARCH, Env:\CGO_ENABLED -ErrorAction SilentlyContinue
}

# --- Frontend ---
Write-Host ""
Write-Host "=== Building frontend ==="

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "node not found — install Node.js 18+ to build frontend"
}

Push-Location $FrontendDir
try {
    & npm ci --prefer-offline
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
} finally {
    Pop-Location
}

# Package standalone build
$Standalone = Join-Path $FrontendDir ".next\standalone"
Copy-Item -Recurse -Force (Join-Path $FrontendDir ".next\static") (Join-Path $Standalone ".next\static")
$PublicDir = Join-Path $FrontendDir "public"
if (Test-Path $PublicDir) {
    Copy-Item -Recurse -Force $PublicDir (Join-Path $Standalone "public")
}

$Tarball = Join-Path $OutDir "cluster-hub-frontend.tar.gz"
& tar -czf $Tarball -C $Standalone .
if ($LASTEXITCODE -ne 0) { throw "tar failed" }
Write-Host "  OK  cluster-hub-frontend.tar.gz"

Write-Host ""
Write-Host "Artifacts in dist/:"
Get-ChildItem $OutDir | Select-Object Name, @{N="Size";E={"{0:N0} KB" -f ($_.Length / 1KB)}}
