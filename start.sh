#!/bin/bash
# ============================================================
#  start.sh  —  Inicia todos los servicios (Raspberry Pi / Linux)
#  Uso:  chmod +x start.sh && ./start.sh
# ============================================================

# ── Rutas (ajusta si tu estructura es diferente) ─────────────
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FASTAPI="$ROOT/agente"                # app.py vive aquí
EXPRESS="$ROOT/../backend-express"    # hermano del repo
FRONTEND="$ROOT/agente"              # src/ Vite

SESSION="domotica"
LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"

# ── Colores ─────────────────────────────────────────────────
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${CYAN}  Iniciando servicios del proyecto...${NC}"
echo ""

# ── Con tmux (recomendado: sudo apt install tmux) ────────────
if command -v tmux &>/dev/null; then

    tmux kill-session -t "$SESSION" 2>/dev/null

    # Ventana 1 — Ollama
    tmux new-session -d -s "$SESSION" -n "ollama"
    tmux send-keys -t "$SESSION:ollama" \
        "echo '[ OLLAMA ]' && ollama serve" Enter

    sleep 3

    # Ventana 2 — FastAPI
    tmux new-window -t "$SESSION" -n "fastapi"
    tmux send-keys -t "$SESSION:fastapi" \
        "echo '[ FASTAPI :8000 ]' && cd '$FASTAPI' && \
        [ -f .venv/bin/activate ] && source .venv/bin/activate; \
        uvicorn app:app --host 0.0.0.0 --port 8000 --reload" Enter

    sleep 3

    # Ventana 3 — Backend Express
    if [ -d "$EXPRESS" ]; then
        tmux new-window -t "$SESSION" -n "express"
        tmux send-keys -t "$SESSION:express" \
            "echo '[ BACKEND :3000 ]' && cd '$EXPRESS' && npm run dev" Enter
    else
        echo -e "${RED}  AVISO: No se encontró backend-express en '$EXPRESS'${NC}"
        echo -e "${YELLOW}  Edita la variable EXPRESS en start.sh${NC}"
    fi

    sleep 2

    # Ventana 4 — Frontend Vite
    tmux new-window -t "$SESSION" -n "frontend"
    tmux send-keys -t "$SESSION:frontend" \
        "echo '[ FRONTEND :5173 ]' && cd '$FRONTEND' && \
        node ./node_modules/vite/bin/vite.js --host" Enter

    # Ir a ventana inicial
    tmux select-window -t "$SESSION:ollama"

    echo -e "${GREEN}  Servicios iniciados en tmux (sesión: $SESSION)${NC}"
    echo ""
    echo "  Frontend  ->  http://$(hostname -I | awk '{print $1}'):5173"
    echo "  Backend   ->  http://localhost:3000/health"
    echo "  FastAPI   ->  http://localhost:8000"
    echo ""
    echo "  Para ver los logs:  tmux attach -t $SESSION"
    echo "  Para detener todo:  ./stop.sh"
    echo ""

    tmux attach-session -t "$SESSION"

else
    # ── Sin tmux: background con archivos de log ─────────────
    echo -e "${YELLOW}  tmux no encontrado, usando procesos en background.${NC}"
    echo -e "${YELLOW}  Instala tmux para mejor experiencia: sudo apt install tmux${NC}"
    echo ""

    # Ollama
    echo -e "${CYAN}  [1/4] Ollama...${NC}"
    ollama serve > "$LOG_DIR/ollama.log" 2>&1 &
    echo $! > "$LOG_DIR/ollama.pid"
    sleep 3

    # FastAPI
    echo -e "${YELLOW}  [2/4] FastAPI :8000...${NC}"
    (
        cd "$FASTAPI"
        [ -f .venv/bin/activate ] && source .venv/bin/activate
        uvicorn app:app --host 0.0.0.0 --port 8000
    ) > "$LOG_DIR/fastapi.log" 2>&1 &
    echo $! > "$LOG_DIR/fastapi.pid"
    sleep 3

    # Backend Express
    if [ -d "$EXPRESS" ]; then
        echo -e "${GREEN}  [3/4] Backend Express :3000...${NC}"
        (cd "$EXPRESS" && npm run dev) > "$LOG_DIR/express.log" 2>&1 &
        echo $! > "$LOG_DIR/express.pid"
    else
        echo -e "${RED}  [3/4] AVISO: No se encontró backend-express en '$EXPRESS'${NC}"
    fi
    sleep 2

    # Frontend Vite
    echo -e "  [4/4] Frontend Vite :5173..."
    (
        cd "$FRONTEND"
        node ./node_modules/vite/bin/vite.js --host
    ) > "$LOG_DIR/frontend.log" 2>&1 &
    echo $! > "$LOG_DIR/frontend.pid"

    echo ""
    echo -e "${GREEN}  Servicios iniciados.${NC}"
    echo "  Frontend  ->  http://$(hostname -I | awk '{print $1}'):5173"
    echo "  Backend   ->  http://localhost:3000/health"
    echo "  FastAPI   ->  http://localhost:8000"
    echo ""
    echo "  Logs en:  $LOG_DIR/"
    echo "  Para detener todo:  ./stop.sh"
    echo ""
fi
