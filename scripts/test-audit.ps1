# test-audit.ps1 — Launch the app for testing.
# Usage: .\scripts\test-audit.ps1

$exe = "build\LucidLinkMCP.exe"
if (Test-Path $exe) {
    Write-Host "Launching $exe ..." -ForegroundColor Cyan
    Write-Host "  1. Click 'Start Audit Watcher...' in the tray menu" -ForegroundColor White
    Write-Host "  2. Click 'Open Audit Dashboard' to see the data" -ForegroundColor White
    Start-Process $exe
} else {
    Write-Host "Binary not found at $exe. Run 'make go' first." -ForegroundColor Red
}
