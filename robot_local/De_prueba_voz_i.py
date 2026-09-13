import json
import os
import subprocess
import sys

from vosk import Model, KaldiRecognizer


BASE_DIR = os.path.dirname(os.path.abspath(__file__))

MODEL_PATH = os.path.abspath(
    os.path.join(BASE_DIR, "..", "modelos", "vosk-model-small-es-0.42")
)

SAMPLE_RATE = 16000


def ejecutar_comando(comando):
    """
    Ejecuta un comando de Linux y devuelve su salida como texto.
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
    salida = ejecutar_comando(["pactl", "get-default-source"])
    return salida.strip() if salida else None


def listar_fuentes_audio():
    """
    Lista fuentes de audio disponibles con pactl.
    """
    salida = ejecutar_comando(["pactl", "list", "short", "sources"])
    fuentes = []

    for linea in salida.splitlines():
        partes = linea.split()
        if len(partes) >= 2:
            nombre = partes[1]

            # Evitar monitores de salida, porque esos son audio de salida, no micrófono
            if ".monitor" in nombre:
                continue

            fuentes.append(nombre)

    return fuentes


def seleccionar_microfono():
    """
    Selecciona automáticamente un micrófono.
    Primero intenta usar el predeterminado.
    Si no sirve, usa el primer micrófono disponible.
    """
    fuente_default = obtener_fuente_default()
    fuentes = listar_fuentes_audio()

    print("\nFuentes de audio detectadas:")

    if fuentes:
        for fuente in fuentes:
            marca = " ← predeterminado" if fuente == fuente_default else ""
            print(f" - {fuente}{marca}")
    else:
        print("No se detectaron micrófonos en PipeWire/PulseAudio.")

    if fuente_default and fuente_default in fuentes:
        return fuente_default

    if fuentes:
        return fuentes[0]

    return None


def main():
    if not os.path.isdir(MODEL_PATH):
        print("No encontré el modelo de Vosk.")
        print("Revisa que exista esta carpeta:")
        print(MODEL_PATH)
        return

    print("Cargando modelo de voz...")
    model = Model(MODEL_PATH)

    recognizer = KaldiRecognizer(model, SAMPLE_RATE)
    recognizer.SetWords(True)

    microfono = seleccionar_microfono()

    if not microfono:
        print("\nNo encontré ningún micrófono disponible.")
        print("Revisa con:")
        print("pactl list short sources")
        print("arecord -l")
        return

    print(f"\nUsando micrófono: {microfono}")
    print("\nPrueba de voz iniciada.")
    print("Habla cerca del micrófono.")
    print("Di 'salir' para terminar.\n")

    comando = [
        "parec",
        "--device", microfono,
        "--rate", str(SAMPLE_RATE),
        "--channels", "1",
        "--format", "s16le"
    ]

    proceso = None

    try:
        proceso = subprocess.Popen(
            comando,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )

        while True:
            data = proceso.stdout.read(4000)

            if not data:
                print("No se recibió audio del micrófono.")
                break

            if recognizer.AcceptWaveform(data):
                result = json.loads(recognizer.Result())
                texto = result.get("text", "").strip()

                if texto:
                    print(f"Tú dijiste: {texto}")

                    if "salir" in texto:
                        print("Terminando prueba de voz.")
                        break
            else:
                partial = json.loads(recognizer.PartialResult())
                texto_parcial = partial.get("partial", "").strip()

                if texto_parcial:
                    print(f"Escuchando: {texto_parcial}", end="\r")

    except KeyboardInterrupt:
        print("\nPrueba detenida con Ctrl+C.")

    except Exception as e:
        print("\nOcurrió un error:")
        print(e)
        print("\nRevisa tus micrófonos con:")
        print("pactl list short sources")

    finally:
        if proceso:
            proceso.terminate()


if __name__ == "__main__":
    main()
