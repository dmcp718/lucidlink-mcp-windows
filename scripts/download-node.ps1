# download-node.ps1 — Download and cache Node.js v22.18.0 for Windows x64
$ErrorActionPreference = "Stop"

$NODE_VERSION = "v22.18.0"
$ARCH = "win-x64"
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$BUILD_DIR = Join-Path (Split-Path -Parent $SCRIPT_DIR) "build"
$CACHE_DIR = Join-Path $BUILD_DIR "node-cache"
$NODE_ZIP = "node-${NODE_VERSION}-${ARCH}.zip"
$NODE_URL = "https://nodejs.org/dist/${NODE_VERSION}/${NODE_ZIP}"
$OUTPUT = Join-Path $BUILD_DIR "node.exe"

New-Item -ItemType Directory -Force -Path $CACHE_DIR | Out-Null

# Download if not cached
$zipPath = Join-Path $CACHE_DIR $NODE_ZIP
if (-not (Test-Path $zipPath)) {
    Write-Host "Downloading Node.js ${NODE_VERSION} (${ARCH})..."
    Invoke-WebRequest -Uri $NODE_URL -OutFile $zipPath -UseBasicParsing
} else {
    Write-Host "Using cached Node.js ${NODE_VERSION}"
}

# Extract just the node.exe binary
Write-Host "Extracting node.exe..."
$tempExtract = Join-Path $CACHE_DIR "node-extract"
if (Test-Path $tempExtract) { Remove-Item -Recurse -Force $tempExtract }

Expand-Archive -Path $zipPath -DestinationPath $tempExtract -Force
$nodeExe = Join-Path (Join-Path $tempExtract "node-${NODE_VERSION}-${ARCH}") "node.exe"
Copy-Item -Path $nodeExe -Destination $OUTPUT -Force

# Clean up extraction temp
Remove-Item -Recurse -Force $tempExtract

Write-Host "Node.js binary ready at $OUTPUT"
Write-Host "Size: $((Get-Item $OUTPUT).Length / 1MB) MB"
