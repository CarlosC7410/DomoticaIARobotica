# 🚀 Instalación y ejecución del Proyecto IoT Multimodal

## 📋 Tabla de contenidos

1. [Requisitos previos](#requisitos)
2. [Instalación del backend](#backend)
3. [Instalación del frontend web](#web)
4. [Instalación de la app Expo](#expo)
5. [Configuración del ESP32](#esp32)
6. [Verificación del stack](#verificación)
7. [Troubleshooting](#troubleshooting)

---

## 📦 Requisitos previos

### Software necesario

```bash
# Verificar Node.js (v18+)
node --version
npm --version

# Verificar Python (v3.10+)
python3 --version

# Verificar Ollama está instalado
ollama --version
```

### Hardware

- Computadora (desarrollo)
- ESP32 con USB para programación
- Móvil con Android (Expo Go) o iOS (Expo Go)
- Router WiFi (todos en la misma red)

---

## 🔧 Instalación del Backend

### 1. Ubícate en la carpeta del backend

```bash
cd "backend-express"
```

### 2. Instala dependencias (incluye Zod nuevo)

```bash
npm install
```

Verifica que `zod` está en `package.json`:
```json
"dependencies": {
  "zod": "^4...."
}
```

### 3. Inicia el backend

```bash
npm run dev
```

Debes ver:
```
[ISO-TIMESTAMP] [INFO] Backend iniciado { port: 3000, ip: 192.168.x.x, llm_service: http://localhost:8000/chat }
```

✅ Backend listo en `http://localhost:3000`

---

## 💻 Instalación del Frontend Web

### 1. Ubícate en la carpeta del agente

```bash
cd "agente"
```

### 2. Instala dependencias (incluye qrcode.react nuevo)

```bash
npm install
```

Verifica que `qrcode.react` está en `package.json`:
```json
"dependencies": {
  "qrcode.react": "^1.0.1"
}
```

### 3. Inicia el frontend

```bash
npm run dev
```

Debes ver:
```
VITE v7.x.x  ready in XXX ms

Local:    http://localhost:5173/
```

✅ Frontend web listo en `http://localhost:5173`

---

## 📱 Instalación de la App Expo

### 1. Ubícate en la carpeta de la app móvil

```bash
cd "agente-movil"
```

### 2. Instala dependencias

```bash
npm install
```

Verifica que estén todas las librerías:
```bash
npm list socket.io-client expo-camera
```

### 3. Inicia Expo

```bash
npm start
```

Debes ver:
```
Expo DevTools is running...
Local:   exp://192.168.x.x:19000
```

### 4. Escanea el código QR

**iOS:**
- Abre la aplicación **Cámara**
- Apunta a la pantalla y mantén presionado
- Toca la notificación "Expo Go"

**Android:**
- Abre **Expo Go**
- Toca el botón abajo (Scan QR code)
- Apunta a la pantalla

✅ App Expo abierta

---

## 🛠️ Configuración del ESP32

### 1. Verifica conexión USB

```bash
# Linux
ls /dev/ttyUSB*      # Deberías ver ttyUSB0, ttyUSB1, etc
ls /dev/ttyACM*      # O ttyACM0

# macOS
ls /dev/tty.SLAB_USBtoUART*
```

### 2. Instala Arduino IDE (si no lo tienes)

```bash
# Ubuntu
sudo apt-get install arduino

# macOS
brew install --cask arduino

# Windows
Descarga desde https://www.arduino.cc/en/software
```

### 3. Abre `ConexionRedAI.ino` en Arduino IDE

1. Archivo → Abrir → `ConexionRedAI.ino`

### 4. Configura placa y puerto

1. **Herramientas** → **Placa** → **ESP32 Dev Module**
2. **Herramientas** → **Puerto** → Selecciona `/dev/ttyUSB0` (o similar)

### 5. Verifica que tienes librerías

En Arduino IDE:
- **Herramientas** → **Administrar librerías**
- Busca e instala:
  - `WebSocketsClient` (versión 2.x)
  - `ArduinoJson` (versión 6.x o 7.x)
  - `WiFi` (incluida con ESP32)

### 6. Actualiza la IP del servidor

En `ConexionRedAI.ino` (línea ~9):

```cpp
const char* host = "192.168.1.121";  // ← CAMBIA ESTO
```

Reemplaza con tu IP actual (la que ves en el backend o frontend web)

Obtén tu IP:
```bash
# En la máquina del servidor
hostname -I

# O mira el backend:
# [INFO] Backend iniciado { port: 3000, ip: 192.168.1.121, ... }
```

### 7. Compila y carga el firmware

1. **Sketch** → **Compilar** (o Ctrl+R)
2. **Sketch** → **Cargar** (o Ctrl+U)

Espera a que termine. Deberías ver:
```
Escribiendo en flash: 100%
```

### 8. Verifica el ESP32

Abre el Monitor Serial:
- **Herramientas** → **Monitor Serial**
- Baud rate: **115200**

Deberías ver:
```
Conectando WiFi...
.....
WiFi OK
IP ESP32: 192.168.x.x
[WS] Conectado al servidor!
```

✅ ESP32 conectado

---

## ✅ Verificación del stack completo

### Paso 1: Verifica que todos los servicios están corriendo

```bash
# Backend
curl http://localhost:3000/health
# Respuesta: {"ok":true}

# FastAPI
curl http://localhost:8000/
# Respuesta: Soporta métodos

# Frontend web
curl http://localhost:5173/
# Respuesta: Documento HTML

# Obtén lista de dispositivos
curl http://localhost:3000/api/devices
# Respuesta: {"devices":[...],"total":1}
```

### Paso 2: Verifica ESP32 en el frontend web

1. Abre `http://localhost:5173/`
2. Escribe la IP del servidor en el input
3. Presiona "Conectar"
4. Deberías ver:
   - ✅ "Servidor detectado"
   - ✅ "Dispositivos IoT: ● ESP32"
   - ✅ "Estado LEDs: Blanco OFF, Amarillo OFF, Azul OFF"

### Paso 3: Prueba chat desde web

1. En el chat, escribe: `"Enciende el LED azul"`
2. El LED físico (GPIO 23) debe encenderse
3. El estado debe actualizarse a "Azul: ON"

### Paso 4: Prueba app Expo

1. Abre la app Expo en tu móvil
2. Presiona "Mostrar QR para móvil" en el frontend web
3. Escanea el QR con tu móvil
4. La app debe mostrar "Conectado a 192.168.x.x"
5. Prueba enviar: `"Apaga el LED azul"`

✅ Stack completo funcionando

---

## 🐛 Troubleshooting

### Backend no inicia

```bash
# Error: EADDRINUSE: address already in use
# Solución: Mata el proceso en puerto 3000
lsof -ti:3000 | xargs kill -9
npm run dev

# Error: zod not found
npm install zod
npm run dev

# Debug mode
DEBUG=true npm run dev
```

### Frontend web no se conecta

```bash
# Verifica URL correcta
# El input debe tener formato IP: 192.168.1.121

# Si el input tiene espacios
# Abre consola (F12) y mira los errores

# Verifica CORS está habilitado en backend
# Debe estar: cors: { origin: "*" }
```

### ESP32 no se conecta

```bash
# Verifica Monitor Serial (115200 baud)
# Deberías ver:
# "Conectando WiFi..."
# "WiFi OK"
# "[WS] Conectado al servidor!"

# Si falla WiFi:
# - Verifica SSID y password en línea 11-12
# - Verifica que el router está encendido
# - Verifica que el ESP32 está alimentado correctamente

# Si falla WebSocket:
# - Verifica la IP en línea 9 es correcta
# - Verifica que el backend está corriendo (curl http://IP:3000/health)
# - Verifica que móvil/ESP32/PC están en la misma red WiFi
```

### App Expo no escanea QR

```bash
# Permisos de cámara
1. En el móvil: Ajustes → Aplicaciones → Expo Go → Permisos
2. Activa "Cámara"

# Si sigue sin funcionar
# Desinstala y reinstala Expo Go
# O usa development build:
eas build --platform android --profile preview
```

### Socket.IO no se conecta desde móvil

```bash
# Verifica que la IP es correcta
# El QR debe contener la IP del servidor real

# Habilita debug en app Expo
# Edit src/store.js:
const newSocket = io(`http://${serverIP}:3000`, {
  // Agrega debug:
  transports: ['websocket', 'polling'],
  debug: true
})
```

### LED no cambia estado

```bash
# Verifica que estás enviando mensaje correcto
Ejemplos válidos:
- "Enciende el LED azul"
- "Apaga el LED blanco"
- "Prende los LEDs"
- "Apaga el foco"

# Verifica que el ESP32 está conectado
curl http://localhost:3000/api/devices
# Debe incluir: {"socketId":"esp32-device","deviceName":"ESP32"}

# Si el mensaje no funciona, el LLM se llevará la consulta
# Abre consola del backend para ver qué pasa
DEBUG=true npm run dev
```

---

## 🔄 Reinicio completo del proyecto

Si algo falla, reinicia todo en este orden:

```bash
# Terminal 1: Ollama
killall ollama
ollama serve

# Terminal 2: FastAPI
cd ProyectoIA
# Mata proceso en puerto 8000 si existe
lsof -ti:8000 | xargs kill -9
uvicorn app:app --host 0.0.0.0 --port 8000

# Terminal 3: Backend
cd backend-express
# Mata proceso en puerto 3000 si existe
lsof -ti:3000 | xargs kill -9
npm run dev

# Terminal 4: Frontend
cd agente
npm run dev

# Terminal 5: App Expo
cd agente-movil
npm start

# Luego recarga la página web (F5)
# Y reinicia la app Expo en el móvil
```

---

## 📊 Puertos a recordar

| Servicio | Puerto | URL |
|----------|--------|-----|
| Backend | 3000 | http://localhost:3000 |
| FastAPI | 8000 | http://localhost:8000 |
| Frontend web | 5173 | http://localhost:5173 |
| Expo DevTools | 19000 | exp://IP:19000 |
| ESP32 | WiFi | 192.168.x.x |

---

## 💡 Tips útiles

### Revisa logs del backend en tiempo real

```bash
DEBUG=true npm run dev | grep -E "\[INFO\]|\[WARN\]|\[ERROR\]"
```

### Verifica ESP32 con netcat

```bash
# El ESP32 debe responder a ping echo
nc -u ESP32_IP 3000
# Pero WebSocket es específico, mejor usa el Monitor Serial de Arduino
```

### Genera un nuevo QR para móvil

```bash
# Si perdiste el QR o cambió la IP:
1. En frontend web (http://localhost:5173)
2. Presiona "Mostrar QR para móvil"
3. Escanea con tu móvil
```

### Guarda sesión en móvil (próxima fase)

Cuando se implemente persistencia (Fase 4), la app recordará:
- IP del servidor
- SessionId
- Historial de comandos

---

## ✨ ¡Listo para usar!

Ahora tienes un sistema IoT completo:
- ✅ Backend con validación y logging
- ✅ Frontend web con generador QR
- ✅ App Expo con Socket.IO
- ✅ ESP32 con reconexión automática
- ✅ Chat multimodal en tiempo real

**Próxima: Fase 3 (Voz, STT, TTS)**
