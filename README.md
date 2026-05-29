# Proyecto IoT + IA (Guía de inicio)

Este workspace tiene 3 servicios principales que trabajan juntos:

- `ProyectoIA` → API FastAPI que consulta Ollama (`/chat` en puerto `8000`).
- `backend-express` → servidor Express + Socket.IO (puerto `3000`).
- `agente` → frontend React/Vite (normalmente puerto `5173`).

## Arquitectura rápida

1. El frontend (`agente`) envía mensajes por Socket.IO al backend.
2. El backend consulta la API FastAPI (`ProyectoIA`).
3. FastAPI llama a Ollama local (`http://localhost:11434/api/chat`).
4. El backend devuelve respuesta de IA y comandos LED al frontend/dispositivos.

## Requisitos

- Linux
- Node.js 18+ y npm
- Python 3.10+
- Ollama instalado y corriendo

## 1) Levantar Ollama y modelo

En una terminal nueva:

```bash
ollama serve
```

En otra terminal (solo la primera vez):

```bash
ollama pull qwen2.5:1.5b-instruct
```

> El modelo configurado en `ProyectoIA/app.py` es `qwen2.5:1.5b-instruct`.

## 2) Levantar servicio FastAPI (`ProyectoIA`)

Desde la raíz del workspace:

```bash
cd "ProyectoIA"
source .venv/bin/activate
pip install fastapi uvicorn requests
uvicorn app:app --host 0.0.0.0 --port 8000
```

### Nota sobre `iniciar.sh`

El script `ProyectoIA/iniciar.sh` usa una IP fija:

```bash
uvicorn app:app --host 192.168.1.121 --port 8000
```

Si esa IP no coincide con tu equipo/red actual, fallará. Por eso se recomienda `--host 0.0.0.0`.

## 3) Levantar backend (`backend-express`)

En otra terminal:

```bash
cd "backend-express"
npm install
npm run dev
```

- Salud del backend: `http://<IP_DEL_SERVIDOR>:3000/health`
- El backend apunta por defecto a `http://localhost:8000/chat` (variable `LLM_SERVICE_URL`).

## 4) Levantar frontend (`agente`)

En otra terminal:

```bash
cd "agente"
npm install
npm run dev
```

Abre la URL de Vite (normalmente `http://localhost:5173`), escribe la IP del servidor del backend y presiona **Conectar**.

## Orden recomendado de arranque

1. Ollama
2. FastAPI (`ProyectoIA`)
3. Backend Express (`backend-express`)
4. Frontend (`agente`)

## Verificación rápida

- FastAPI responde en `http://localhost:8000` (endpoint principal usado: `POST /chat`).
- Backend responde en `GET /health`.
- Frontend conecta al backend y permite chat.

## Problemas comunes

- **No conecta frontend**: verifica IP correcta del backend en la UI y puerto `3000` abierto.
- **Error en backend hacia LLM**: confirma que FastAPI esté corriendo en `:8000`.
- **Error en FastAPI hacia Ollama**: confirma `ollama serve` activo y modelo descargado.
- **`ERR_MODULE_NOT_FOUND` al correr `npm run dev` en `agente`**: este proyecto ya usa ejecución directa de Vite en `package.json` para evitar el problema de `.bin/vite` en entornos donde npm no crea symlinks correctamente.
# Proyecto-LLM-Domotica
# Proyecto-LLM-Domotica-1
# ProyectoDomaticaIA
