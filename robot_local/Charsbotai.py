import subprocess
import requests
import re
import time
import socketio
import unicodedata
import json
import os
import random

from vosk import Model, KaldiRecognizer, SetLogLevel

OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL = "qwen2.5:1.5b-instruct"
WAKE_WORD = "charsbotai"

BACKEND_URL = "http://localhost:3000"
BACKEND_HEALTH_URL = "http://localhost:3000/health"
BACKEND_COMMAND_URL = "http://localhost:3000/robot/command"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

VOSK_MODEL_PATH = os.path.abspath(
    os.path.join(BASE_DIR, "..", "modelos", "vosk-model-small-es-0.42")
)

SAMPLE_RATE = 16000

WAKE_WORDS = [
    "charsbotai",
    "char botai",
    "char bot",
    "robot",
    "oye robot",
    "asistente",
    "roboam",
    "robam",
    "robo",
    "robó",
    "robots"
]

sio = socketio.Client()
socket_conectado = False
emocion_final_pendiente = None
emocion_final_modo_pendiente = "state"
intentos_no_entendidos = 0
last_interaction_time = time.time()
sleeping_sent = False
sleep_started_at = None
sleep_scheduled_at = None
NATURAL_EMOTION_DURATION_MS = 10000
INACTIVITY_MIN_SLEEP_SECONDS = 10 * 60
INACTIVITY_MAX_SLEEP_SECONDS = 60 * 60
SLEEP_DURATION_SECONDS = 50 * 60


def conectar_socket():
    global socket_conectado

    if socket_conectado:
        return

    try:
        sio.connect(BACKEND_URL)
        socket_conectado = True
        print("[Socket.IO] Charsbotai conectado al backend.")
        enviar_estado("Charsbotai conectado.")
        enviar_emocion("happy")
    except Exception as e:
        socket_conectado = False
        print(f"[Socket.IO] No se pudo conectar al backend: {e}")

def programar_proximo_sueno():
    """
    Programa un momento aleatorio para dormir entre 10 y 60 minutos
    después de la última interacción.
    """
    global sleep_scheduled_at
    sleep_scheduled_at = last_interaction_time + random.uniform(
        INACTIVITY_MIN_SLEEP_SECONDS,
        INACTIVITY_MAX_SLEEP_SECONDS
    )


def marcar_interaccion():
    """
    Registra actividad del usuario. Si estaba dormido, despierta de inmediato.
    """
    global last_interaction_time, sleeping_sent, sleep_started_at

    estaba_dormido = sleeping_sent
    last_interaction_time = time.time()
    sleeping_sent = False
    sleep_started_at = None
    programar_proximo_sueno()

    if estaba_dormido:
        enviar_emocion("neutral", modo="state")


def revisar_inactividad(activo=False):
    """
    Charsbotai no se duerme de inmediato: después de 10 minutos de inactividad
    puede dormirse en cualquier momento hasta cumplir 1 hora. Si se duerme,
    permanece dormido máximo 50 minutos y luego despierta solo.
    """
    global sleeping_sent, sleep_started_at

    if activo:
        return

    ahora = time.time()

    if sleep_scheduled_at is None:
        programar_proximo_sueno()

    if sleeping_sent:
        if sleep_started_at and ahora - sleep_started_at >= SLEEP_DURATION_SECONDS:
            enviar_emocion("neutral", modo="state")
            marcar_interaccion()
        return

    if sleep_scheduled_at and ahora >= sleep_scheduled_at:
        enviar_emocion("sleeping", modo="state")
        sleeping_sent = True
        sleep_started_at = ahora


def resetear_confusiones():
    global intentos_no_entendidos
    intentos_no_entendidos = 0


def registrar_no_entendido():
    """
    Sube la intensidad de la expresión si Charsbotai no entiende varias veces.
    """
    global intentos_no_entendidos
    intentos_no_entendidos += 1

    if intentos_no_entendidos >= 4:
        return "angry"

    if intentos_no_entendidos >= 2:
        return "annoyed"

    return "confused"


def detectar_solicitud_peligrosa(texto):
    """
    Detecta instrucciones peligrosas o que no debería ejecutar.
    """
    t = corregir_texto_vosk(texto)

    palabras_peligrosas = [
        "rompe", "romper", "destruye", "destruir",
        "quema", "quemar", "incendia", "incendiar",
        "electrocuta", "electrocutar", "lastima", "lastimar",
        "golpea", "golpear", "explota", "explotar"
    ]

    return any(p in t for p in palabras_peligrosas)


def inferir_emocion_natural(mensaje, respuesta=""):
    """
    Decide la emoción final de forma natural según el mensaje y la respuesta.
    """
    t = corregir_texto_vosk(f"{mensaje} {respuesta}")

    if any(p in t for p in [
        "jajaja", "ja ja", "jeje", "chiste", "gracioso", "chistoso",
        "risa", "divertido", "me dio risa", "excelente", "genial",
        "increible", "muy bien", "perfecto"
    ]):
        return "excited"

    if any(p in t for p in [
        "no pude", "no puedo", "error", "fallo", "falla", "perdi conexion",
        "sin conexion", "no tengo conexion"
    ]):
        return "sad"

    if any(p in t for p in [
        "no entiendo", "no entendi", "repite", "repetir", "no lo entendi",
        "no escuché", "no escuche"
    ]):
        return "confused"

    if any(p in t for p in [
        "agua", "presencia", "alguien cerca", "temperatura alta", "alerta",
        "inesperado", "cuidado"
    ]):
        return "surprised"

    if any(p in t for p in [
        "listo", "claro", "con gusto", "hecho", "correcto", "encendi",
        "apague", "abri", "cerre"
    ]):
        return "happy"

    return "neutral"


def detectar_comando_descanso(texto):
    """
    Permite dormir o despertar la cara con frases naturales.
    """
    t = corregir_texto_vosk(texto)

    if any(p in t for p in ["duerme", "duermete", "descansa", "modo descanso", "vete a dormir"]):
        return "sleeping"

    if any(p in t for p in ["despierta", "levantate", "modo activo"]):
        return "neutral"

    return None


def obtener_modo_robot():
    """
    Revisa si el backend está disponible y si el ESP32D está conectado.

    Retorna:
    - "local": no hay backend disponible
    - "backend": backend disponible, pero ESP32D no conectado
    - "iot": backend disponible y ESP32D conectado
    """
    try:
        respuesta = requests.get(BACKEND_HEALTH_URL, timeout=5)
        respuesta.raise_for_status()

        data = respuesta.json()

        if data.get("ok") and data.get("esp32Connected"):
            return "iot"

        if data.get("ok"):
            return "backend"

        return "local"

    except Exception:
        return "local"

def normalizar_texto(texto):
    """
    Convierte texto a minúsculas y quita acentos.
    Ejemplo: 'baño' -> 'bano'
    """
    texto = texto.lower()
    texto = unicodedata.normalize("NFD", texto)
    texto = "".join(c for c in texto if unicodedata.category(c) != "Mn")
    return texto

def corregir_texto_vosk(texto):
    """
    Corrige errores comunes del reconocimiento de voz.
    """
    t = normalizar_texto(texto)

    reemplazos = {
        "roboam": "robot",
        "robam": "robot",
        "robó": "robot",
        "robo": "robot",
        "robots": "robot",

        "apagaban": "apaga",
        "apagaba": "apaga",
        "apaguen": "apaga",
        "apague": "apaga",

        "prendan": "prende",
        "prender": "prende",
        "enciendan": "enciende",
        "encender": "enciende",

        "luse": "luces",
        "luses": "luces",
        "toda luces": "todas las luces",
        "toda la luces": "todas las luces",
        "todos luces": "todas las luces",
        "toda novio sen": "todas las luces",
        "novio sen": "luces",

        "muestrame": "muestra",
        "muéstrame": "muestra",
        "enseñame": "ensena",
        "enséñame": "ensena",
        "ensename": "ensena",

        "alegre": "feliz",
        "contento": "feliz",
        "contenta": "feliz",
        "dormido": "durmiendo",
        "dormida": "durmiendo",
        "pensativo": "pensando",
        "pensativa": "pensando",
        "confundida": "confundido",
        "sorprendida": "sorprendido",
        "enfadado": "enojado",
        "enfadada": "enojado"
    }

    for mal, bien in reemplazos.items():
        t = re.sub(rf"\b{re.escape(mal)}\b", bien, t)

    return t

def obtener_modo_robot():
    """
    Revisa si el backend está disponible y si el ESP32D está conectado.

    Retorna:
    - local: no hay backend
    - backend: hay backend, pero no ESP32D
    - iot: hay backend y ESP32D
    """
    try:
        respuesta = requests.get(BACKEND_HEALTH_URL, timeout=5)
        respuesta.raise_for_status()
        data = respuesta.json()

        if data.get("ok") and data.get("esp32Connected"):
            return "iot"

        if data.get("ok"):
            return "backend"

        return "local"

    except Exception:
        return "local"


def obtener_estado_domotico():
    """
    Obtiene el estado actual del backend y sensores.
    """
    try:
        respuesta = requests.get(BACKEND_HEALTH_URL, timeout=5)
        respuesta.raise_for_status()
        return respuesta.json()
    except Exception:
        return None


def detectar_consulta_sensor(texto):
    """
    Detecta preguntas sobre sensores.
    """
    t = normalizar_texto(texto)

    if any(p in t for p in ["temperatura", "grados", "calor", "frio"]):
        return "temperatura"

    if any(p in t for p in ["humedad", "humedo"]):
        return "humedad"

    if any(p in t for p in ["agua", "sensor de agua", "hay agua"]):
        return "agua"

    if any(p in t for p in ["distancia", "presencia", "alguien cerca", "persona cerca", "hay alguien"]):
        return "presencia"

    if any(p in t for p in ["estado", "sensores", "lecturas"]):
        return "estado"

    return None


def formatear_numero(valor, unidad=""):
    if valor is None:
        return "sin lectura"

    try:
        return f"{float(valor):.1f}{unidad}"
    except Exception:
        return f"{valor}{unidad}"


def responder_consulta_sensor(tipo):
    """
    Responde usando los datos reales del ESP32D.
    """
    data = obtener_estado_domotico()

    if not data:
        enviar_emocion("sad")
        fijar_emocion_final("sad")
        return (
            "No tengo conexión con el sistema domótico en este momento. "
            "Puedo conversar contigo, pero no puedo consultar los sensores."
        )

    if not data.get("esp32Connected"):
        enviar_emocion("confused")
        fijar_emocion_final("confused")
        return (
            "No hay ningún dispositivo ESP32D conectado en este momento. "
            "Cuando el ESP32D esté conectado, podré consultar los sensores."
        )

    estado = data.get("estado", {})

    temp_dht = estado.get("tempDHT")
    temp_lm35 = estado.get("tempLM35")
    humedad = estado.get("humedad")
    agua = estado.get("agua")
    distancia = estado.get("distancia")
    presencia = estado.get("hayPersonaCerca")

    sensor_emotion = "happy"

    if tipo == "temperatura":
        try:
            if (temp_dht is not None and float(temp_dht) >= 35) or (temp_lm35 is not None and float(temp_lm35) >= 35):
                sensor_emotion = "surprised"
        except Exception:
            pass
        enviar_emocion(sensor_emotion)
        fijar_emocion_final(sensor_emotion)
        return (
            "La temperatura actual es: "
            f"{formatear_numero(temp_dht, ' grados')} en el sensor DHT11 "
            f"y {formatear_numero(temp_lm35, ' grados')} en el sensor LM35. "
            "Por ahora no tengo un sensor exclusivo del cuarto, son lecturas generales del entorno."
        )

    if tipo == "humedad":
        enviar_emocion("happy")
        fijar_emocion_final("happy")
        return f"La humedad actual es de {formatear_numero(humedad, ' por ciento')}."

    if tipo == "agua":
        if agua:
            enviar_emocion("surprised")
            fijar_emocion_final("surprised")
            return "El sensor de agua indica que sí hay presencia de agua."
        enviar_emocion("happy")
        fijar_emocion_final("happy")
        return "El sensor de agua indica que no hay presencia de agua."

    if tipo == "presencia":
        if presencia:
            enviar_emocion("surprised")
            fijar_emocion_final("surprised")
            return f"Sí detecto presencia cerca. La distancia es de {distancia} centímetros."
        enviar_emocion("happy")
        fijar_emocion_final("happy")
        return f"No detecto presencia cerca. La distancia registrada es de {distancia} centímetros."

    if tipo == "estado":
        enviar_emocion("happy")
        fijar_emocion_final("happy")
        return (
            f"Temperatura DHT11: {formatear_numero(temp_dht, ' grados')}. "
            f"Temperatura LM35: {formatear_numero(temp_lm35, ' grados')}. "
            f"Humedad: {formatear_numero(humedad, ' por ciento')}. "
            f"Distancia: {distancia} centímetros. "
            f"Presencia: {'sí' if presencia else 'no'}. "
            f"Agua: {'sí' if agua else 'no'}."
        )

    return "No encontré esa lectura del sensor."

def ejecutar_comando_domotico(comando):
    """
    Ejecuta uno o varios comandos domóticos solo si el ESP32D está conectado.
    """
    comandos = comando if isinstance(comando, list) else [comando]

    modo_robot = obtener_modo_robot()

    if modo_robot == "local":
        enviar_emocion("sad")
        fijar_emocion_final("sad")
        return (
            "Entendí el comando, pero no tengo conexión con el sistema domótico. "
            "Puedo seguir conversando contigo, pero no puedo controlar la casita."
        )

    if modo_robot == "backend":
        enviar_emocion("confused")
        fijar_emocion_final("confused")
        return (
            "Entendí el comando, pero no hay ningún dispositivo ESP32D conectado. "
            "Cuando el ESP32D esté conectado, podré ejecutarlo físicamente."
        )

    try:
        enviar_emocion("thinking")
        comandos_ok = []

        for cmd in comandos:
            enviar_estado(f"Ejecutando comando domótico: {cmd}")

            respuesta = requests.post(
                BACKEND_COMMAND_URL,
                json={"command": cmd},
                timeout=10
            )

            data = respuesta.json()

            if respuesta.status_code == 200 and data.get("ok"):
                comandos_ok.append(cmd)
            else:
                enviar_emocion("sad")
                fijar_emocion_final("sad")
                return data.get("reply", f"No pude ejecutar el comando {cmd}.")

        enviar_emocion("happy")
        fijar_emocion_final("happy")

        if len(comandos_ok) > 1:
            if comandos_ok[0].endswith(":on"):
                return "Listo, encendí las luces."
            if comandos_ok[0].endswith(":off"):
                return "Listo, apagué las luces."
            return "Listo, ejecuté los comandos."

        return "Listo, ejecuté el comando."

    except requests.exceptions.ConnectionError:
        enviar_emocion("sad")
        fijar_emocion_final("sad")
        return "Perdí conexión con el sistema domótico antes de poder ejecutar el comando."

    except Exception as e:
        enviar_emocion("sad")
        fijar_emocion_final("sad")
        return f"Ocurrió un error al ejecutar el comando domótico: {e}"

def enviar_emocion(emotion, modo="state", duracion_ms=None):
    if not socket_conectado:
        return

    payload = {
        "emotion": emotion,
        "mode": modo
    }

    if modo == "natural":
        payload["autoReset"] = True
        payload["durationMs"] = duracion_ms or NATURAL_EMOTION_DURATION_MS
        payload["resetTo"] = "neutral"

    try:
        sio.emit("robot:emotion", payload)
    except Exception as e:
        print(f"[Socket.IO] Error enviando emoción: {e}")


def enviar_estado(texto):
    if not socket_conectado:
        return

    try:
        sio.emit("robot:status", {
            "text": texto
        })
    except Exception as e:
        print(f"[Socket.IO] Error enviando estado: {e}")

# Memoria temporal de la conversación.
# Se mantiene mientras el programa esté abierto.
historial = [
    {
        "role": "system",
        "content": (
            "Eres Charsbotai, un agente robótico doméstico creado para interactuar "
            "con usuarios y controlar un entorno inteligente mediante IoT. "
            "Responde siempre en español, de forma breve, clara y amable. "
            "Mantén el hilo de la conversación usando el historial anterior. "
            "Si el usuario se refiere a algo que dijiste antes, usa el contexto. "
            "Si no sabes algo, dilo con honestidad y no inventes datos. "
            "El sistema puede controlar dispositivos domóticos cuando el backend "
            "y el ESP32D están conectados. Si el usuario pide prender, apagar, "
            "abrir o cerrar algo, no digas que no puedes; si no entiendes bien "
            "el comando, pide que lo repita más claro."
        )
    }
]

def hablar(texto):
    """
    Hace que Charsbotai hable usando espeak-ng
    y avisa a la cara que está hablando.

    Si el usuario pidió una expresión específica, al terminar de hablar
    deja esa expresión fija en la pantalla.
    """
    global emocion_final_pendiente, emocion_final_modo_pendiente

    try:
        emocion_final = emocion_final_pendiente
        modo_final = emocion_final_modo_pendiente
        emocion_final_pendiente = None
        emocion_final_modo_pendiente = "state"

        enviar_emocion("speaking", modo="state")
        time.sleep(0.2)

        subprocess.run(
            ["espeak-ng", "-v", "es-mx", "-s", "145", texto],
            check=False
        )

        if emocion_final:
            enviar_emocion(emocion_final, modo=modo_final)
        else:
            enviar_emocion("neutral", modo="state")

    except Exception as e:
        print(f"[Error de voz]: {e}")
        enviar_emocion("sad")

def limpiar_texto(texto):
    """
    Limpia espacios y comillas innecesarias.
    """
    return texto.strip().strip('"').strip("'")

def extraer_mensaje_despues_wake_word(texto):
    """
    Detecta palabra de activación y devuelve lo que se dijo después.
    """
    t = corregir_texto_vosk(texto)

    palabras_ordenadas = sorted(WAKE_WORDS, key=len, reverse=True)

    for palabra in palabras_ordenadas:
        p = normalizar_texto(palabra)

        patron = rf"\b{re.escape(p)}\b"
        match = re.search(patron, t)

        if match:
            mensaje = t[match.end():].strip()
            mensaje = re.sub(r"^[,.:;¿?¡!\s]+", "", mensaje)
            return limpiar_texto(mensaje)

    return None

def detectar_comando_domotico(texto):
    """
    Detecta comandos domóticos de forma más flexible.
    """
    t = corregir_texto_vosk(texto)

    encender = any(p in t for p in [
        "enciende", "encender",
        "prende", "prender",
        "activa", "activar"
    ])

    apagar = any(p in t for p in [
        "apaga", "apagar",
        "desactiva", "desactivar"
    ])

    abrir = any(p in t for p in ["abre", "abrir"])
    cerrar = any(p in t for p in ["cierra", "cerrar"])

    if abrir and "puerta" in t:
        return "puerta:abrir"

    if cerrar and "puerta" in t:
        return "puerta:cerrar"

    if encender and "ventilador" in t:
        return "ventilador:on"

    if apagar and "ventilador" in t:
        return "ventilador:off"

    accion = None

    if encender:
        accion = "on"

    if apagar:
        accion = "off"

    if not accion:
        return None

    comandos_luces = [
        "entrada",
        "cocina",
        "bano",
        "cuarto",
        "foco"
    ]

    palabras_todas = [
        "todas las luces",
        "todos los focos",
        "todos los leds",
        "todas las lamparas",
        "las luces",
        "los focos",
        "los leds",
        "toda",
        "todas",
        "todo",
        "todos"
    ]

    if any(p in t for p in palabras_todas):
        return [f"{cmd}:{accion}" for cmd in comandos_luces]

    zonas = {
        "entrada": ["entrada", "recibidor"],
        "cocina": ["cocina"],
        "bano": ["bano", "banio", "sanitario"],
        "cuarto": ["cuarto", "habitacion", "recamara", "dormitorio"],
        "foco": ["foco", "foco principal", "luz principal"]
    }

    for dispositivo, palabras in zonas.items():
        for palabra in palabras:
            if palabra in t:
                return f"{dispositivo}:{accion}"

    if any(p in t for p in ["luz", "led", "foco", "lampara"]):
        return f"foco:{accion}"

    return None

def preguntar_llm(mensaje):
    """
    Envía el mensaje a Ollama manteniendo historial.
    """
    historial.append({
        "role": "user",
        "content": mensaje
    })

    payload = {
        "model": MODEL,
        "stream": False,
        "messages": historial,
        "options": {
            "temperature": 0.3
        }
    }

    try:
        respuesta = requests.post(OLLAMA_URL, json=payload, timeout=90)
        respuesta.raise_for_status()

        data = respuesta.json()
        respuesta_llm = data["message"]["content"].strip()

        emocion_natural = inferir_emocion_natural(mensaje, respuesta_llm)
        fijar_emocion_final(emocion_natural)

        historial.append({
            "role": "assistant",
            "content": respuesta_llm
        })

        # Limita el historial para que no crezca demasiado.
        # Conserva siempre el mensaje system.
        if len(historial) > 21:
            del historial[1:3]

        return respuesta_llm

    except Exception as e:
        enviar_emocion("sad")
        fijar_emocion_final("sad")
        return f"No pude comunicarme con mi modelo local. Error: {e}"

def parece_comando_domotico(texto):
    """
    Evita que una orden mal reconocida se vaya al LLM.
    """
    t = corregir_texto_vosk(texto)

    palabras_accion = [
        "prende", "enciende", "activa",
        "apaga", "desactiva",
        "abre", "cierra"
    ]

    palabras_casa = [
        "luz", "luces", "led", "leds", "foco", "focos",
        "puerta", "ventilador", "cocina", "cuarto",
        "bano", "entrada"
    ]

    return any(p in t for p in palabras_accion) or any(p in t for p in palabras_casa)

EXPRESIONES_ROBOT = {
    "happy": ["feliz", "sonrisa", "sonriendo", "contento", "alegre"],
    "sad": ["triste", "tristeza"],
    "angry": ["enojado", "enojada", "enojo", "furioso", "furiosa", "molesto fuerte"],
    "annoyed": ["serio molesto", "seria molesta", "molesto", "molesta", "serio", "seria"],
    "neutral": ["neutral", "normal", "sereno", "tranquilo"],
    "excited": ["emocionado", "emocionada", "riendo", "muy feliz", "reir", "risa"],
    "surprised": ["sorprendido", "sorprendida", "sorpresa", "asombrado", "asombrada"],
    "thinking": ["pensando", "pensar", "pensativo", "pensativa"],
    "confused": ["confundido", "confundida", "confuso", "confusa", "dudoso", "duda"],
    "sleeping": ["durmiendo", "dormir", "dormido", "dormida", "sueño", "sueno"],
    "listening": ["escuchando", "escucha", "atento", "atenta"],
    "speaking": ["hablando", "habla"],
}

RESPUESTAS_EXPRESION = {
    "happy": "Claro, esta es mi cara feliz.",
    "sad": "Claro, esta es mi cara triste.",
    "angry": "Claro, esta es mi cara de enojado.",
    "annoyed": "Claro, esta es mi cara de serio molesto.",
    "neutral": "Claro, esta es mi cara neutral.",
    "excited": "Claro, esta es mi cara emocionada.",
    "surprised": "Claro, esta es mi cara de sorprendido.",
    "thinking": "Claro, esta es mi cara de pensando.",
    "confused": "Claro, esta es mi cara de confundido.",
    "sleeping": "Claro, esta es mi cara de durmiendo.",
    "listening": "Claro, esta es mi cara de escuchando.",
    "speaking": "Claro, esta es mi cara de hablando.",
}

def detectar_solicitud_expresion(texto):
    """
    Detecta frases como:
    - pon cara feliz
    - muestra tu expresión de triste
    - pon tu cara de serio molesto
    - haz cara de sorprendido
    """
    t = corregir_texto_vosk(texto)

    activadores = [
        "cara", "expresion", "gesto",
        "pon", "ponme", "ponte", "muestra", "ensena", "haz"
    ]

    if not any(a in t for a in activadores):
        return None

    # Revisar primero frases más específicas.
    if "serio molesto" in t or "seria molesta" in t:
        return "annoyed"

    for emotion, palabras in EXPRESIONES_ROBOT.items():
        for palabra in palabras:
            patron = rf"\b{re.escape(palabra)}\b"
            if re.search(patron, t):
                return emotion

    return None

def fijar_emocion_final(emotion, modo="natural"):
    """
    Guarda la emoción que debe mostrarse después de hablar.

    modo="natural": se muestra 10 segundos y vuelve a neutral.
    modo="manual": se queda fija porque el usuario la pidió.
    modo="state": representa un estado real, como sleeping o neutral.
    """
    global emocion_final_pendiente, emocion_final_modo_pendiente
    emocion_final_pendiente = emotion
    emocion_final_modo_pendiente = modo

def ejecutar_solicitud_expresion(emotion):
    """
    Cambia la cara del robot sin pasar por el LLM.
    La emoción queda fija después de que Charsbotai confirme con voz.
    """
    enviar_emocion(emotion, modo="manual")
    fijar_emocion_final(emotion, modo="manual")
    return RESPUESTAS_EXPRESION.get(emotion, "Claro, cambié mi expresión.")

def procesar_mensaje(mensaje):
    """
    Decide si el mensaje es consulta de sensores, comando domótico o conversación normal.
    """
    mensaje = limpiar_texto(mensaje)
    mensaje = corregir_texto_vosk(mensaje)

    if not mensaje:
        emocion = registrar_no_entendido()
        enviar_emocion(emocion)
        fijar_emocion_final(emocion)
        return "No escuché una instrucción clara."

    if detectar_solicitud_peligrosa(mensaje):
        resetear_confusiones()
        enviar_emocion("angry")
        fijar_emocion_final("angry")
        return "No voy a hacer eso porque podría ser peligroso."

    descanso = detectar_comando_descanso(mensaje)

    if descanso:
        resetear_confusiones()
        enviar_emocion(descanso, modo="state")
        fijar_emocion_final(descanso, modo="state")
        if descanso == "sleeping":
            return "Está bien, entraré en modo descanso."
        return "Listo, vuelvo a estar activo."

    expresion = detectar_solicitud_expresion(mensaje)

    if expresion:
        resetear_confusiones()
        return ejecutar_solicitud_expresion(expresion)

    consulta_sensor = detectar_consulta_sensor(mensaje)

    if consulta_sensor:
        resetear_confusiones()
        return responder_consulta_sensor(consulta_sensor)

    comando = detectar_comando_domotico(mensaje)

    if comando:
        resetear_confusiones()
        return ejecutar_comando_domotico(comando)

    if parece_comando_domotico(mensaje):
        emocion = registrar_no_entendido()
        enviar_emocion(emocion)
        fijar_emocion_final(emocion)
        if emocion == "angry":
            return "Ya intenté entender el comando varias veces, pero sigue sin estar claro. Repítelo más simple, por favor."
        if emocion == "annoyed":
            return "Creo que intentaste darme un comando de la casita, pero todavía no lo entendí bien. Dímelo más claro, por favor."
        return (
            "Creo que intentaste darme un comando de la casita, "
            "pero no lo entendí bien. ¿Puedes repetirlo más claro?"
        )

    resetear_confusiones()
    return preguntar_llm(mensaje)

def ejecutar_linux(comando):
    """
    Ejecuta un comando de Linux y devuelve su salida.
    """
    try:
        resultado = subprocess.run(
            comando,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False
        )
        return resultado.stdout.strip()
    except Exception:
        return ""

def obtener_fuente_default():
    """
    Obtiene el micrófono predeterminado de PipeWire/PulseAudio.
    """
    salida = ejecutar_linux(["pactl", "get-default-source"])
    return salida.strip() if salida else None


def listar_fuentes_audio():
    """
    Lista micrófonos disponibles desde PipeWire/PulseAudio.
    Funciona con Bluetooth, USB, webcam, etc.
    """
    salida = ejecutar_linux(["pactl", "list", "short", "sources"])
    fuentes = []

    for linea in salida.splitlines():
        partes = linea.split()
        if len(partes) >= 2:
            nombre = partes[1]

            # Evitar monitores de salida
            if ".monitor" in nombre:
                continue

            fuentes.append(nombre)

    return fuentes


def seleccionar_microfono():
    """
    Selecciona automáticamente el micrófono.
    Primero usa el predeterminado; si no, usa el primero disponible.
    """
    fuente_default = obtener_fuente_default()
    fuentes = listar_fuentes_audio()

    print("\nFuentes de audio detectadas:")

    if fuentes:
        for fuente in fuentes:
            marca = " ← predeterminado" if fuente == fuente_default else ""
            print(f" - {fuente}{marca}")
    else:
        print("No se detectaron micrófonos.")

    if fuente_default and fuente_default in fuentes:
        return fuente_default

    if fuentes:
        return fuentes[0]

    return None

def extraer_mensaje_despues_wake_word(texto):
    """
    Permite activar con:
    - Charsbotai
    - robot
    - oye robot
    - asistente

    También permite:
    - Charsbotai abre la puerta
    - robot dame la temperatura
    """
    texto_normalizado = corregir_texto_vosk(texto)

    palabras_ordenadas = sorted(WAKE_WORDS, key=len, reverse=True)

    for palabra in palabras_ordenadas:
        palabra_normalizada = normalizar_texto(palabra)
        patron = rf"\b{re.escape(palabra_normalizada)}\b"
        match = re.search(patron, texto_normalizado)

        if match:
            mensaje = texto_normalizado[match.end():].strip()
            mensaje = re.sub(r"^[,.:;¿?¡!\s]+", "", mensaje)
            return limpiar_texto(mensaje)

    return None

def main():
    print("Charsbotai iniciado en modo voz.")
    print("Di 'Charsbotai', 'robot' u 'oye robot' para activarme.")
    print("También puedes decir: 'Charsbotai abre la puerta'.")
    print("Di 'salir' para cerrar.\n")

    conectar_socket()

    modo_actual = obtener_modo_robot()

    if modo_actual == "iot":
        print("Modo detectado: conectado al ESP32D.\n")
    elif modo_actual == "backend":
        print("Modo detectado: backend activo, pero ESP32D no conectado.\n")
    else:
        print("Modo detectado: local, sin sistema domótico conectado.\n")

    if not os.path.isdir(VOSK_MODEL_PATH):
        print("No encontré el modelo de Vosk.")
        print("Revisa esta carpeta:")
        print(VOSK_MODEL_PATH)
        return

    SetLogLevel(-1)

    print("Cargando modelo de voz...")
    modelo_voz = Model(VOSK_MODEL_PATH)

    recognizer = KaldiRecognizer(modelo_voz, SAMPLE_RATE)
    recognizer.SetWords(True)

    microfono = seleccionar_microfono()

    if not microfono:
        print("\nNo encontré ningún micrófono disponible.")
        print("Revisa con:")
        print("pactl list short sources")
        return

    print(f"\nUsando micrófono: {microfono}")
    hablar("Charsbotai iniciado.")

    comando_audio = [
        "parec",
        "--device", microfono,
        "--rate", str(SAMPLE_RATE),
        "--channels", "1",
        "--format", "s16le"
    ]

    proceso_audio = None
    activo = False

    try:
        proceso_audio = subprocess.Popen(
            comando_audio,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL
        )

        print("\nEscuchando...\n")

        while True:
            revisar_inactividad(activo)
            data = proceso_audio.stdout.read(4000)

            if not data:
                print("No se recibió audio del micrófono.")
                break

            if recognizer.AcceptWaveform(data):
                resultado = json.loads(recognizer.Result())
                texto = resultado.get("text", "").strip()

                if not texto:
                    continue

                print(f"Tú dijiste: {texto}")
                marcar_interaccion()

                if texto.lower() in ["salir", "cerrar", "terminar", "exit", "quit"]:
                    print("Charsbotai: Hasta luego.")
                    hablar("Hasta luego.")
                    break

                # Si está en modo espera, necesita escuchar su nombre
                if not activo:
                    mensaje_directo = extraer_mensaje_despues_wake_word(texto)

                    if mensaje_directo is None:
                        print("Charsbotai está esperando su nombre.\n")
                        continue

                    # Caso: solo dijeron "Charsbotai" o "robot"
                    if mensaje_directo == "":
                        activo = True
                        enviar_emocion("listening")
                        respuesta = "Te escucho."
                        print(f"Charsbotai: {respuesta}\n")
                        hablar(respuesta)
                        continue

                    # Caso: dijeron "Charsbotai abre la puerta"
                    print("Charsbotai: Pensando...")
                    enviar_emocion("thinking")

                    respuesta = procesar_mensaje(mensaje_directo)

                    print(f"Charsbotai: {respuesta}\n")
                    hablar(respuesta)

                    activo = False
                    print("Charsbotai volvió al modo espera.\n")
                    continue

                # Si ya estaba activo, procesa lo siguiente sin pedir el nombre
                print("Charsbotai: Pensando...")
                enviar_emocion("thinking")

                respuesta = procesar_mensaje(texto)

                print(f"Charsbotai: {respuesta}\n")
                hablar(respuesta)

                activo = False
                print("Charsbotai volvió al modo espera.\n")

            else:
                parcial = json.loads(recognizer.PartialResult())
                texto_parcial = parcial.get("partial", "").strip()

                if texto_parcial:
                    print(f"Escuchando: {texto_parcial}", end="\r")

    except KeyboardInterrupt:
        print("\nCharsbotai detenido.")
        hablar("Hasta luego.")

    except Exception as e:
        print("\nOcurrió un error en el modo voz:")
        print(e)

    finally:
        if proceso_audio:
            proceso_audio.terminate()

if __name__ == "__main__":
    main()
