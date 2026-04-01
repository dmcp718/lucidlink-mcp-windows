# build.ps1 — Master build script for LucidLink MCP Windows app
$ErrorActionPreference = "Stop"

$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$ROOT_DIR = Split-Path -Parent $SCRIPT_DIR
$FILES_DIR = Join-Path (Split-Path -Parent $ROOT_DIR) "mcp-server"
$BUILD_DIR = Join-Path $ROOT_DIR "build"
$OUTPUT_DIR = Join-Path $BUILD_DIR "LucidLinkMCP"

# Ensure Go is in PATH (common install locations)
$goLocations = @("C:\Program Files\Go\bin", "C:\Go\bin", "$env:USERPROFILE\go\bin")
foreach ($loc in $goLocations) {
    if ((Test-Path $loc) -and ($env:PATH -notlike "*$loc*")) {
        $env:PATH = "$loc;$env:PATH"
    }
}

Write-Host "=== LucidLink MCP Windows App Build ==="
Write-Host "Files dir: $FILES_DIR"
Write-Host "Build dir: $BUILD_DIR"
Write-Host ""

# Clean previous output (preserve caches)
if (Test-Path $OUTPUT_DIR) { Remove-Item -Recurse -Force $OUTPUT_DIR }
New-Item -ItemType Directory -Force -Path $BUILD_DIR | Out-Null

# -----------------------------------------------
# Step 0: Build fs-index-server Go binary
# -----------------------------------------------
$FS_INDEX_DIR = Join-Path $FILES_DIR "fs-index-server"
$FS_INDEX_EXE = Join-Path $BUILD_DIR "fs-index-server.exe"

if (Test-Path $FS_INDEX_DIR) {
    $needsBuild = $false
    if (-not (Test-Path $FS_INDEX_EXE)) {
        $needsBuild = $true
    } else {
        $exeTime = (Get-Item $FS_INDEX_EXE).LastWriteTime
        $goFiles = Get-ChildItem -Path $FS_INDEX_DIR -Filter "*.go" -Recurse
        foreach ($f in $goFiles) {
            if ($f.LastWriteTime -gt $exeTime) { $needsBuild = $true; break }
        }
    }

    if ($needsBuild) {
        Write-Host "[0/5] Building fs-index-server (Go binary)..."
        Push-Location $FS_INDEX_DIR
        $env:GOOS = "windows"
        $env:GOARCH = "amd64"
        $ErrorActionPreference = "Continue"
        $buildOutput = & go build -o $FS_INDEX_EXE . 2>&1 | Out-String
        $buildExitCode = $LASTEXITCODE
        $ErrorActionPreference = "Stop"
        if ($buildExitCode -ne 0) {
            Pop-Location
            Write-Host "  WARNING: fs-index-server failed to compile for Windows (uses Unix-specific syscalls)."
            Write-Host "  Filespace search will not be available. Other MCP servers will work normally."
        } else {
            Pop-Location
            Write-Host "  fs-index-server built for windows/amd64."
        }
    } else {
        Write-Host "[0/5] fs-index-server up to date, skipping."
    }
} else {
    Write-Host "[0/5] WARNING: fs-index-server/ not found, skipping Go build."
}

# -----------------------------------------------
# Step 1: Build TypeScript MCP servers
# -----------------------------------------------
# Verify submodule is initialized
$packageJson = Join-Path $FILES_DIR "package.json"
if (-not (Test-Path $packageJson)) {
    Write-Host ""
    Write-Error @"
mcp-server submodule is not initialized. The mcp-server/ directory is empty.

Run the following from the repo root to initialize it:
    git submodule update --init mcp-server

This requires SSH access to git@bitbucket.org:lucidlink/lucidlink-mcp-server.git
"@
    exit 1
}

Write-Host "[1/5] Building TypeScript MCP servers..."
Push-Location $FILES_DIR
if (Test-Path (Join-Path $FILES_DIR "node_modules")) {
    npm install --prefer-offline
} else {
    if (Test-Path (Join-Path $FILES_DIR "package-lock.json")) {
        npm ci
    } else {
        npm install
    }
}
if ($LASTEXITCODE -ne 0) { Write-Error "npm install failed"; exit 1 }
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "npm run build failed"; exit 1 }
Pop-Location
Write-Host "  TypeScript build complete."

# -----------------------------------------------
# Step 2: Download Node.js binary
# -----------------------------------------------
$NODE_EXE = Join-Path $BUILD_DIR "node.exe"
if (Test-Path $NODE_EXE) {
    Write-Host "[2/5] Node.js binary cached, skipping download."
} else {
    Write-Host "[2/5] Downloading Node.js binary..."
    & (Join-Path $SCRIPT_DIR "download-node.ps1")
}

# -----------------------------------------------
# Step 3: Install production-only dependencies
# -----------------------------------------------
Write-Host "[3/5] Installing production dependencies..."
$PROD_MODULES = Join-Path $BUILD_DIR "node_modules_prod"
if (-not (Test-Path (Join-Path $PROD_MODULES "node_modules"))) {
    if (Test-Path $PROD_MODULES) { Remove-Item -Recurse -Force $PROD_MODULES }
    New-Item -ItemType Directory -Force -Path $PROD_MODULES | Out-Null
    Copy-Item -Path (Join-Path $FILES_DIR "package.json") -Destination $PROD_MODULES
    Push-Location $PROD_MODULES
    npm install --omit=dev --ignore-scripts
    if ($LASTEXITCODE -ne 0) { Write-Error "Production npm install failed"; exit 1 }
    Pop-Location
} else {
    Write-Host "  Production dependencies cached, skipping."
}

# -----------------------------------------------
# Step 4: Compile Go tray app
# -----------------------------------------------
Write-Host "[4/5] Compiling Go system tray app..."
Push-Location $ROOT_DIR
$TRAY_EXE = Join-Path $BUILD_DIR "LucidLinkMCP.exe"
go build -ldflags "-H windowsgui -s -w" -o $TRAY_EXE .
if ($LASTEXITCODE -ne 0) { Write-Error "Go build failed"; exit 1 }
Pop-Location
Write-Host "  Tray app compiled."

# -----------------------------------------------
# Step 5: Assemble output directory
# -----------------------------------------------
Write-Host "[5/5] Assembling output directory..."

New-Item -ItemType Directory -Force -Path $OUTPUT_DIR | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $OUTPUT_DIR "mcp") | Out-Null

# Tray app exe
Copy-Item -Path $TRAY_EXE -Destination (Join-Path $OUTPUT_DIR "LucidLinkMCP.exe")

# Node.js binary
Copy-Item -Path $NODE_EXE -Destination (Join-Path $OUTPUT_DIR "node.exe")

# MCP server manifest and compiled JS
Copy-Item -Path (Join-Path $FILES_DIR "mcp-servers.json") -Destination (Join-Path $OUTPUT_DIR "mcp-servers.json")
$distDir = Join-Path $FILES_DIR "dist"
Copy-Item -Path "$distDir\*" -Destination (Join-Path $OUTPUT_DIR "mcp") -Recurse -Force

# Doc chunks
$docsChunks = Join-Path (Join-Path (Join-Path $FILES_DIR "src") "docs") "chunks"
if (Test-Path $docsChunks) {
    $destChunks = Join-Path (Join-Path (Join-Path $OUTPUT_DIR "mcp") "docs") "chunks"
    New-Item -ItemType Directory -Force -Path $destChunks | Out-Null
    Copy-Item -Path "$docsChunks\*.md" -Destination $destChunks
}

# Python SDK doc chunks
$pyChunks = Join-Path (Join-Path (Join-Path $FILES_DIR "src") "python-sdk") "chunks"
if (Test-Path $pyChunks) {
    $destPyChunks = Join-Path (Join-Path (Join-Path $OUTPUT_DIR "mcp") "python-sdk") "chunks"
    New-Item -ItemType Directory -Force -Path $destPyChunks | Out-Null
    Copy-Item -Path "$pyChunks\*.md" -Destination $destPyChunks
}

# Production node_modules
Copy-Item -Path (Join-Path $PROD_MODULES "node_modules") -Destination (Join-Path $OUTPUT_DIR "node_modules") -Recurse -Force

# fs-index-server binary and templates
if (Test-Path $FS_INDEX_EXE) {
    Copy-Item -Path $FS_INDEX_EXE -Destination (Join-Path $OUTPUT_DIR "fs-index-server.exe")
    $templates = Join-Path (Join-Path $FILES_DIR "fs-index-server") "templates"
    if (Test-Path $templates) {
        Copy-Item -Path $templates -Destination (Join-Path $OUTPUT_DIR "templates") -Recurse -Force
    }
    Write-Host "  fs-index-server bundled."
}

# Clean up temp prod modules
Remove-Item -Recurse -Force $PROD_MODULES

Write-Host ""
Write-Host "=== Build Complete ==="
Write-Host "Output: $OUTPUT_DIR"
$size = (Get-ChildItem -Recurse $OUTPUT_DIR | Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host ("Size: {0:N1} MB" -f $size)
Write-Host ""
Write-Host "Next steps:"
Write-Host "  Run LucidLinkMCP.exe from the output directory"
Write-Host "  Or create an installer with: makensis installer/installer.nsi"
