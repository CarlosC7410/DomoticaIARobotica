# ============================================================
#  start.ps1  —  Inicia todos los servicios del proyecto
#  Ejecutar desde la raíz del repo:  .\start.ps1
# ============================================================

# ── Rutas (ajusta si tu carpeta backend-express está en otro lugar) ──
$ROOT      = $PSScriptRoot
$FASTAPI   = Join-Path $ROOT "agente"                  # app.py
$EXPRESS   = Join-Path $ROOT "backend-test"            # backend de prueba local
$FRONTEND  = Join-Path $ROOT "agente"                  # src/ (Vite)

# ── Abre una ventana PowerShell nueva con título de color ────────────
function Start-Service($title, $color, $command) {
    $cmd = "`$host.UI.RawUI.WindowTitle = '$title'; Write-Host '[ $title ]' -ForegroundColor $color; $command"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd
}

Write-Host ""
Write-Host "  Iniciando servicios..." -ForegroundColor Cyan
Write-Host ""

# 1. Ollama  (primero: el modelo debe estar listo antes que FastAPI)
Write-Host "  [1/4] Ollama..." -ForegroundColor Cyan
Start-Service "OLLAMA" "Cyan" "ollama serve"
Start-Sleep -Seconds 3

# 2. FastAPI
Write-Host "  [2/4] FastAPI :8000..." -ForegroundColor Yellow
$fastapiCmd  = "cd '$FASTAPI'; "
$fastapiCmd += "if (Test-Path '.venv\Scripts\Activate.ps1') { . '.\.venv\Scripts\Activate.ps1' } "
$fastapiCmd += "else { Write-Host 'Sin venv, usando Python global' -ForegroundColor Yellow }; "
$fastapiCmd += "uvicorn app:app --host 0.0.0.0 --port 8000 --reload"
Start-Service "FASTAPI :8000" "Yellow" $fastapiCmd
Start-Sleep -Seconds 3

# 3. Backend Express
Write-Host "  [3/4] Backend Express :3000..." -ForegroundColor Green
if (-not (Test-Path $EXPRESS)) {
    Write-Host "  AVISO: No se encontro backend-express en '$EXPRESS'" -ForegroundColor Red
    Write-Host "  Edita la variable `$EXPRESS en start.ps1" -ForegroundColor Red
} else {
    Start-Service "BACKEND :3000" "Green" "cd '$EXPRESS'; npm run dev"
}
Start-Sleep -Seconds 2

# 4. Frontend (Vite)
Write-Host "  [4/4] Frontend Vite :5173..." -ForegroundColor Magenta
Start-Service "FRONTEND :5173" "Magenta" "cd '$FRONTEND'; node ./node_modules/vite/bin/vite.js --host"

Write-Host ""
Write-Host "  Servicios iniciados:" -ForegroundColor Green
Write-Host "  Frontend  ->  http://localhost:5173"
Write-Host "  Backend   ->  http://localhost:3000/health"
Write-Host "  FastAPI   ->  http://localhost:8000"
Write-Host ""
Write-Host "  Para detener todo ejecuta: .\stop.ps1" -ForegroundColor DarkGray
Write-Host ""
