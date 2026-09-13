import subprocess
import requests
import re
import time
import socketio
import unicodedata

OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL = "qwen2.5:1.5b-instruct"
WAKE_WORD = "charsbotai"

BACKEND_URL = "http://localhost:3000"
BACKEND_HEALTH_URL = "http://localhost:3000/health"
BACKEND_COMMAND_URL = "http://localhost:3000/robot/command"

sio = socketio.Client()
socket_conectado = False


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
        return (
            "No tengo conexión con el sistema domótico en este momento. "
            "Puedo conversar contigo, pero no puedo consultar los sensores."
        )

    if not data.get("esp32Connected"):
        enviar_emocion("confused")
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

    enviar_emocion("happy")

    if tipo == "temperatura":
        return (
            "La temperatura actual es: "
            f"{formatear_numero(temp_dht, ' grados')} en el sensor DHT11 "
            f"y {formatear_numero(temp_lm35, ' grados')} en el sensor LM35. "
            "Por ahora no tengo un sensor exclusivo del cuarto, son lecturas generales del entorno."
        )

    if tipo == "humedad":
        return f"La humedad actual es de {formatear_numero(humedad, ' por ciento')}."

    if tipo == "agua":
        if agua:
            return "El sensor de agua indica que sí hay presencia de agua."
        return "El sensor de agua indica que no hay presencia de agua."

    if tipo == "presencia":
        if presencia:
            return f"Sí detecto presencia cerca. La distancia es de {distancia} centímetros."
        return f"No detecto presencia cerca. La distancia registrada es de {distancia} centímetros."

    if tipo == "estado":
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
        return (
            "Entendí el comando, pero no tengo conexión con el sistema domótico. "
            "Puedo seguir conversando contigo, pero no puedo controlar la casita."
        )

    if modo_robot == "backend":
        enviar_emocion("confused")
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
                return data.get("reply", f"No pude ejecutar el comando {cmd}.")

        enviar_emocion("happy")

        if len(comandos_ok) > 1:
            if comandos_ok[0].endswith(":on"):
                return "Listo, encendí las luces."
            if comandos_ok[0].endswith(":off"):
                return "Listo, apagué las luces."
            return "Listo, ejecuté los comandos."

        return "Listo, ejecuté el comando."

    except requests.exceptions.ConnectionError:
        enviar_emocion("sad")
        return "Perdí conexión con el sistema domótico antes de poder ejecutar el comando."

    except Exception as e:
        enviar_emocion("sad")
        return f"Ocurrió un error al ejecutar el comando domótico: {e}"

def enviar_emocion(emotion):
    if not socket_conectado:
        return

    try:
        sio.emit("robot:emotion", {
            "emotion": emotion
        })
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
            "Por ahora estás en modo local de prueba: puedes conversar, pero todavía "
            "no puedes controlar físicamente el ESP32D desde este archivo."
        )
    }
]

def hablar(texto):
    """
    Hace que Charsbotai hable usando espeak-ng
    y avisa a la cara que está hablando.
    """
    try:
        enviar_emocion("speaking")

        subprocess.run(
            ["espeak-ng", "-v", "es-mx", "-s", "145", texto],
            check=False
        )

        enviar_emocion("happy")
        time.sleep(1)
        enviar_emocion("neutral")

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
    Permite usar:
    - Charsbotai
    - Charsbotai hola
    - Oye Charsbotai dime un chiste
    """
    texto_lower = texto.lower()

    if WAKE_WORD not in texto_lower:
        return None

    indice = texto_lower.find(WAKE_WORD)
    mensaje = texto[indice + len(WAKE_WORD):].strip()

    # Quitar signos o palabras de relleno al inicio
    mensaje = re.sub(r"^[,.:;¿?¡!\s]+", "", mensaje)
    return limpiar_texto(mensaje)

def detectar_comando_domotico(texto):
    """
    Detecta comandos domóticos de forma más flexible.
    Puede regresar:
    - un comando string: "foco:on"
    - varios comandos en lista: ["entrada:on", "cocina:on", ...]
    - None si no detecta comando
    """
    t = normalizar_texto(texto)

    encender = any(p in t for p in ["enciende", "prende", "activa", "encender", "prender"])
    apagar = any(p in t for p in ["apaga", "desactiva", "apagar"])
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

    # Encender o apagar todas las luces/leds/focos
    palabras_todas = [
        "todas las luces",
        "todos los focos",
        "todos los leds",
        "todas las lamparas",
        "las luces",
        "los focos",
        "los leds"
    ]

    if any(p in t for p in palabras_todas):
        return [f"{cmd}:{accion}" for cmd in comandos_luces]

    zonas = {
        "entrada": ["entrada", "recibidor"],
        "cocina": ["cocina"],
        "bano": ["bano", "baño", "sanitario"],
        "cuarto": ["cuarto", "habitacion", "recamara", "dormitorio"],
        "foco": ["foco", "foco principal", "luz principal"]
    }

    for dispositivo, palabras in zonas.items():
        for palabra in palabras:
            if palabra in t:
                return f"{dispositivo}:{accion}"

    # Si dice solo "enciende la luz" o "apaga el foco",
    # lo mandamos al foco principal.
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
        return f"No pude comunicarme con mi modelo local. Error: {e}"

def procesar_mensaje(mensaje):
    """
    Decide si el mensaje es consulta de sensores, comando domótico o conversación normal.
    """
    mensaje = limpiar_texto(mensaje)

    if not mensaje:
        return "No escuché una instrucción clara."

    consulta_sensor = detectar_consulta_sensor(mensaje)

    if consulta_sensor:
        return responder_consulta_sensor(consulta_sensor)

    comando = detectar_comando_domotico(mensaje)

    if comando:
        return ejecutar_comando_domotico(comando)

    return preguntar_llm(mensaje)

def main():
    print("Charsbotai iniciado.")
    print("Modo actual: local de prueba.")
    print("Escribe 'Charsbotai' para activarme.")
    print("También puedes escribir: 'Charsbotai dime un chiste'.")
    print("Escribe 'salir' para cerrar.\n")

    conectar_socket()
    modo_actual = obtener_modo_robot()

    if modo_actual == "iot":
        print("Modo detectado: conectado al ESP32D.\n")
    elif modo_actual == "backend":
        print("Modo detectado: backend activo, pero ESP32D no conectado.\n")
    else:
        print("Modo detectado: local, sin sistema domótico conectado.\n")
        hablar("Charsbotai iniciado.")

    activo = False

    while True:
        try:
            texto = input("Tú: ")
        except KeyboardInterrupt:
            print("\nCharsbotai: Hasta luego.")
            hablar("Hasta luego.")
            break

        texto = limpiar_texto(texto)

        if not texto:
            continue

        if texto.lower() in ["salir", "exit", "quit", "cerrar"]:
            print("Charsbotai: Hasta luego.")
            hablar("Hasta luego.")
            break

        # Si está en modo espera, necesita escuchar su nombre.
        if not activo:
            mensaje_directo = extraer_mensaje_despues_wake_word(texto)

            if mensaje_directo is None:
                print("Charsbotai está esperando su nombre.\n")
                continue

            # Caso: usuario dice solo "Charsbotai"
            if mensaje_directo == "":
                activo = True
                respuesta = "Te escucho."
                print(f"Charsbotai: {respuesta}\n")
                hablar(respuesta)
                continue

            # Caso: usuario dice "Charsbotai dime algo"
            print("Charsbotai: Pensando...")
            enviar_emocion("thinking")
            respuesta = procesar_mensaje(mensaje_directo)
            print(f"Charsbotai: {respuesta}\n")
            hablar(respuesta)

            activo = False
            print("Charsbotai volvió al modo espera.\n")
            continue

        # Si ya estaba activo, procesa el siguiente mensaje directamente.
        print("Charsbotai: Pensando...")
        respuesta = procesar_mensaje(texto)
        print(f"Charsbotai: {respuesta}\n")
        hablar(respuesta)

        activo = False
        print("Charsbotai volvió al modo espera.\n")


if __name__ == "__main__":
    main()
