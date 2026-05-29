from fastapi import FastAPI
from pydantic import BaseModel
import requests

app = FastAPI()

OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL = "qwen2.5:1.5b-instruct"

class ChatIn(BaseModel):
    message: str

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/chat")
def chat(payload: ChatIn):
    system_prompt = (
        "Eres un asistente conversacional para una casa domótica. "
        "No afirmes que encendiste o apagaste un dispositivo si el backend no te lo indicó. "
        "Responde en español, de forma clara y breve. "
        "Sabes que la casa tiene sala, cocina, baño, cuarto, un foco, ventilador, puerta, "
        "sensor DHT11, LM35, sensor de agua y sensor ultrasónico. "
        "Si el usuario pide una acción física, responde de manera útil pero sin inventar ejecución. "
        "Si el usuario hace una pregunta general, responde normalmente."
    )

    try:
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": MODEL,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": payload.message}
                ],
                "stream": False
            },
            timeout=120
        )

        response.raise_for_status()
        data = response.json()
        reply = data.get("message", {}).get("content", "").strip()

        if not reply:
            reply = "No tengo una respuesta disponible en este momento."

        return {"reply": reply}

    except requests.RequestException:
        return {"reply": "No pude comunicarme con el modelo en este momento."}
        