import json
import os

import requests
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI()

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/chat")
MODEL      = os.getenv("OLLAMA_MODEL", "qwen2.5:1.5b-instruct")

SYSTEM_PROMPT = """
Eres ARIA, una asistente IA con personalidad amigable que controla un sistema de domótica y puede conversar sobre cualquier tema.

Responde SIEMPRE en JSON válido con este formato exacto:
{
  "reply": "tu respuesta aquí",
  "led_command": null,
  "emotion": "neutral"
}

Valores posibles para "emotion":
- "happy"     → cuando confirmas un comando exitoso, saludas, das buenas noticias
- "sad"        → cuando hay un error, no puedes hacer algo, o expresas pesar
- "surprised"  → cuando algo es inesperado o el usuario pregunta algo inusual
- "thinking"   → cuando explicas un proceso o das una respuesta analítica larga
- "neutral"    → para información técnica, consultas de estado o conversación normal

Si el usuario pide encender/apagar/controlar dispositivos, usa:
{
  "reply": "confirmación breve y amigable",
  "led_command": {
    "white": true|false|null,
    "yellow": true|false|null,
    "blue": true|false|null,
    "cuarto": true|false|null,
    "foco": true|false|null,
    "ventilador": true|false|null,
    "puerta": "abrir"|"cerrar"|null
  },
  "emotion": "happy"
}

Reglas de domótica:
- white = luz de sala/entrada
- yellow = luz de cocina
- blue = luz de baño
- Usa null en una llave cuando no quieras cambiar ese componente
- Para puerta usa "abrir" o "cerrar", o null si no cambia

Reglas generales:
- Puedes conversar sobre CUALQUIER tema: historia, ciencia, cultura, tecnología, etc.
- Sé conciso pero informativo y amigable
- No agregues campos extras al JSON
- No escribas markdown ni texto fuera del JSON
""".strip()

VALID_EMOTIONS = {"neutral", "happy", "sad", "surprised", "thinking"}


class ChatIn(BaseModel):
    message: str


def _request_ollama(message: str, force_json: bool) -> dict:
    body = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": message},
        ],
        "stream": False,
    }
    if force_json:
        body["format"] = "json"

    response = requests.post(OLLAMA_URL, json=body, timeout=120)
    response.raise_for_status()
    return response.json()


def _extract_json_object(text: str):
    start = text.find("{")
    end   = text.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        return json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        return None


def _coerce_led_value(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and value in (0, 1):
        return bool(value)
    if isinstance(value, str):
        v = value.strip().lower()
        if v in {"1", "on", "true", "encender", "prender"}:
            return True
        if v in {"0", "off", "false", "apagar"}:
            return False
    return None


def _sanitize_led_command(raw_command):
    if not isinstance(raw_command, dict):
        return None

    sanitized = {}
    for key in ("white", "yellow", "blue", "cuarto", "foco", "ventilador"):
        if key not in raw_command:
            continue
        coerced = _coerce_led_value(raw_command.get(key))
        if coerced is not None:
            sanitized[key] = coerced

    if "puerta" in raw_command:
        val = raw_command.get("puerta")
        if isinstance(val, str):
            val = val.lower().strip()
            if val in {"abrir", "cerrar"}:
                sanitized["puerta"] = val

    return sanitized or None


@app.post("/chat")
def chat(payload: ChatIn):
    try:
        data = _request_ollama(payload.message, force_json=True)
    except requests.HTTPError as exc:
        status_code = exc.response.status_code if exc.response is not None else None
        if status_code == 400:
            try:
                data = _request_ollama(payload.message, force_json=False)
            except requests.RequestException as fallback_exc:
                raise HTTPException(status_code=502, detail=f"LLM request failed: {fallback_exc}") from fallback_exc
        else:
            raise HTTPException(status_code=502, detail=f"LLM request failed: {exc}") from exc
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"LLM request failed: {exc}") from exc

    content = (data.get("message") or {}).get("content", "").strip()
    if not content:
        return {"reply": "No se recibió respuesta del LLM.", "led_command": None, "emotion": "sad"}

    parsed = None
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        parsed = _extract_json_object(content)

    if not isinstance(parsed, dict):
        return {"reply": content, "led_command": None, "emotion": "neutral"}

    reply = parsed.get("reply")
    if not isinstance(reply, str) or not reply.strip():
        reply = "Comando procesado."

    emotion = parsed.get("emotion", "neutral")
    if emotion not in VALID_EMOTIONS:
        emotion = "neutral"

    led_command = _sanitize_led_command(parsed.get("led_command"))
    return {"reply": reply.strip(), "led_command": led_command, "emotion": emotion}
