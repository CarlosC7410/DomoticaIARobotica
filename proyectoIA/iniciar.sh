#!/bin/bash

echo "Activando entorno virtual..."
source venv/bin/activate

echo "Iniciando servidor FastAPI..."
uvicorn app:app --host 0.0.0.0 --port 8000
