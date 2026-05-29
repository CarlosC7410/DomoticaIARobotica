# ============================================================
#  stop.ps1  —  Detiene todos los servicios del proyecto
# ============================================================

Write-Host ""
Write-Host "  Deteniendo servicios..." -ForegroundColor Red

# Uvicorn (FastAPI)
Get-Process -Name "python", "python3", "uvicorn" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match "uvicorn" -or $_.Name -match "python" } |
    ForEach-Object { Write-Host "  Deteniendo FastAPI (PID $($_.Id))"; Stop-Process -Id $_.Id -Force }

# Node (Express + Vite) — solo los de este proyecto
Get-Process -Name "node" -ErrorAction SilentlyContinue |
    ForEach-Object { Write-Host "  Deteniendo Node (PID $($_.Id))"; Stop-Process -Id $_.Id -Force }

# Ollama
Get-Process -Name "ollama" -ErrorAction SilentlyContinue |
    ForEach-Object { Write-Host "  Deteniendo Ollama (PID $($_.Id))"; Stop-Process -Id $_.Id -Force }

Write-Host ""
Write-Host "  Listo." -ForegroundColor Green
Write-Host ""
