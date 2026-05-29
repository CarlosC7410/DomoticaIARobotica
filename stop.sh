#!/bin/bash
# ============================================================
#  stop.sh  —  Detiene todos los servicios
# ============================================================

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT/logs"
SESSION="domotica"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo ""
echo -e "${RED}  Deteniendo servicios...${NC}"

# Si existe sesión tmux, mátala
if command -v tmux &>/dev/null && tmux has-session -t "$SESSION" 2>/dev/null; then
    tmux kill-session -t "$SESSION"
    echo "  Sesión tmux '$SESSION' cerrada."
fi

# Matar por PID guardado (modo sin tmux)
for pidfile in "$LOG_DIR"/*.pid; do
    [ -f "$pidfile" ] || continue
    PID=$(cat "$pidfile")
    if kill -0 "$PID" 2>/dev/null; then
        kill "$PID" && echo "  Detenido PID $PID ($(basename $pidfile .pid))"
    fi
    rm -f "$pidfile"
done

# Fallback: matar por nombre de proceso
pkill -f "ollama serve"   2>/dev/null && echo "  Ollama detenido."
pkill -f "uvicorn app:app" 2>/dev/null && echo "  FastAPI detenido."
pkill -f "vite"           2>/dev/null && echo "  Frontend detenido."

echo ""
echo -e "${GREEN}  Listo.${NC}"
echo ""
