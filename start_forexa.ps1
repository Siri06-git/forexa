# start_forexa.ps1 — Launch FastAPI backend and Vite frontend
# Run from the Forexa project root:  .\start_forexa.ps1

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "=== FOREXA Phase 4 Launcher ===" -ForegroundColor Cyan
Write-Host "Root: $Root"

# 1. Start FastAPI backend in a new window
Write-Host "`nStarting FastAPI backend on http://localhost:8000 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root'; python -m uvicorn src.api:app --host 0.0.0.0 --port 8000 --reload" -WindowStyle Normal

Start-Sleep -Seconds 3

# 2. Start Vite frontend in a new window
Write-Host "Starting Vite frontend on http://localhost:5173 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\frontend'; npm run dev" -WindowStyle Normal

Start-Sleep -Seconds 3

Write-Host "`n=== Both servers starting ===" -ForegroundColor Cyan
Write-Host "  Backend API: http://localhost:8000/docs" -ForegroundColor White
Write-Host "  Frontend:    http://localhost:5173" -ForegroundColor White
Write-Host ""
Write-Host "NOTE: All data is SYNTHETIC demonstration data." -ForegroundColor Yellow
