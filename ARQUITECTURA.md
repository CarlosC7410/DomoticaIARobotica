# 🏗️ Arquitectura completa del sistema

## Diagrama de componentes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         INTERNET/CLOUD (Futuro)                             │
│                     (Fase 5: Sensores + Automatizaciones)                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                     ↑
                                     │
        ┌────────────────────────────┼────────────────────────────┐
        │                            │                            │
        ▼                            ▼                            ▼
  ┌──────────────┐          ┌──────────────────┐        ┌─────────────────┐
  │   Browser    │          │   Móvil/Tablet   │        │   PostgreSQL    │
  │ (React/Vite)│          │    (Expo App)    │        │  (Persistencia) │
  │  :5173       │          │    (New)         │        │   (Fase 4)      │
  └──────┬───────┘          └────────┬─────────┘        └────────┬────────┘
         │                           │                           │
         │ Socket.IO                 │ Socket.IO                 │ SQL
         │ + QR Gen                  │ + QR Scanner              │
         │                           │                           │
         └───────────────┬───────────┴──────────────────────────┘
                         │
                         ▼ Puerto 3000
        ┌─────────────────────────────────────────────┐
        │   EXPRESS.JS BACKEND + SOCKET.IO            │
        │   ─────────────────────────────────────────  │
        │  • Validación Zod                           │
        │  • Intent Type detection (actuator/sensor)  │
        │  • Logging estructurado                      │
        │  • Heartbeat para ESP32 (30s)               │
        │  • CORS habilitado                          │
        │                                             │
        │  PUERTOS:                                   │
        │  • Socket.IO: :3000                         │
        │  • WebSocket ESP32: :3000                   │
        │  • REST API: :3000/api/*                    │
        │  • Health check: :3000/health               │
        │                                             │
        │  EVENTOS PRINCIPALES:                       │
        │  → chat:message (entrada de usuario)        │
        │  → led:state (actualización de LEDs)        │
        │  → device:hello (registro de dispositivos)  │
        │  → led:command (comando a ESP32)            │
        │  → devices:update (lista de dispositivos)   │
        └──────────┬─────────────────────────┬────────┘
                   │                         │
        HTTP GET  │ POST /chat              │ WebSocket
        :8000     │                         │
                   ▼                        ▼ WiFi + WebSocket
        ┌──────────────────┐      ┌────────────────────────┐
        │   FASTAPI        │      │    ESP32               │
        │   OLLAMA LLM     │      │    ───────────────────  │
        │   (ProyectoIA)   │      │                        │
        │   :8000          │      │  • GPIO 21: LED Blanco │
        │                  │      │  • GPIO 22: LED Amarillo
        │  Procesa:        │      │  • GPIO 23: LED Azul   │
        │  • Chat messages │      │  • GPIO 19: Foco/Relay │
        │  • LLM inference │      │                        │
        │  • LED commands  │      │  RECONEXIÓN AUTO:      │
        │                  │      │  • WiFi check (5s)     │
        │                  │      │  • Backoff exp (2-30s) │
        │                  │      │  • Max 10 reintentos   │
        │                  │      │  • Heartbeat response  │
        └──────────────────┘      └────────────────────────┘
                     ↑                         ▲
                     │ Ollama                  │
                     │ localhost:11434         │ Powered by USB
                     │                         │
        ┌────────────▼──────────────┐         │
        │  OLLAMA LOCAL LLM          │    [USB Adapter]
        │  ─────────────────────────  │
        │  qwen2.5:1.5b-instruct     │
        │  (Or other supported model) │
        └────────────────────────────┘

```

---

## Flujo de datos: "Enciende el LED azul"

```
┌─────────────────────────────────────────────────────────────────┐
│ USUARIO EN WEB                                                   │
│ Escribe: "Enciende el LED azul"                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼ emit('chat:message', '...')
                    ┌──────────────────┐
                    │ io.on('connection')
                    │ Backend recibe   │
                    └────────┬─────────┘
                             │
                     ┌───────▼────────────────┐
                     │ safeValidate()          │
                     │ ChatMessageSchema       │
                     │ ✅ Válido              │
                     └───────┬────────────────┘
                             │
                     ┌───────▼────────────────┐
                     │ detectIntentType()      │
                     │ "enciende" → "actuator"│
                     └───────┬────────────────┘
                             │
                     ┌───────▼────────────────┐
                     │ textToCommand()         │
                     │ Detecta LED azul        │
                     │ Crea: {blue: true}     │
                     └───────┬────────────────┘
                             │
                    ┌────────▼─────────────┐
                    │ esp32Socket.send()   │
                    │ "blue:on"            │
                    └────────┬─────────────┘
                             │ WebSocket
                             ▼
        ┌────────────────────────────────────┐
        │ ESP32 recibe "blue:on"             │
        │ → GPIO 23 = HIGH                   │
        │ → LED fisico enciende              │
        │ → applyLedStates()                 │
        │ → Envía estado JSON al backend     │
        └────────┬─────────────────────────┘
                 │ WebSocket
                 ▼
        ┌──────────────────────────────────┐
        │ Backend recibe led:state          │
        │ Actualiza lastLedState            │
        │ io.emit('led:state', {...})       │
        └────────┬──────────────────────────┘
                 │
        ┌────────┴──────────────────┐
        │                           │
        ▼ Socket.IO                 ▼ Socket.IO
   ┌─────────────┐            ┌──────────────────┐
   │ Frontend Web│            │ App Móvil (Expo) │
   │ LED Status: │            │ LED Status:      │
   │ Azul: ON ✅ │            │ Azul: ON ✅      │
   └─────────────┘            └──────────────────┘

⏱️ Tiempo total: ~100ms
```

---

## Flujo de datos: "¿Cuál es el estado de los LEDs?" (CONSULTA)

```
USUARIO EN MÓVIL
"¿Estado de los LEDs?"
         │
         ▼ emit('chat:message')
    Backend recibe
         │
         ▼ detectIntentType()
   "estado" → "sensor" ✅
         │
         ▼ textToCommand()
   No detecta comando específico
         │
         ▼ callLLM()
   POST http://localhost:8000/chat
         │
         ▼ FastAPI + Ollama
   Procesa: "¿Estado LEDs?"
   LLM responde: "Los LEDs están..."
         │
         ▼ Backend
   emit('chat:message', {
     user: 'IA',
     text: 'Los LEDs están...',
     intent_type: 'sensor',
     timestamp: 1234567
   })
         │
         ▼ Socket.IO
    Frontend Web + App Móvil
    Reciben respuesta
```

---

## Flujo de pareado QR (PRIMERA VEZ)

```
USUARIO CON MÓVIL SIN CONECTAR

1. Abre app Expo
   → QRScannerScreen
   → Pide permiso de cámara ✅
   → Muestra viewfinder con overlay

2. En web: http://localhost:5173
   → Presiona "Mostrar QR para móvil"
   → Genera QR con IP: 192.168.1.121

3. En móvil: Escanea QR
   → onBarcodeScanned() se dispara
   → Extrae IP: "192.168.1.121"
   → Valida regex isValidIP()
   → Llamada a connectToServer(ip)

4. Backend:
   → Recibe nueva conexión Socket.IO
   → emit('led:state', lastLedState)
   → Envía lista de dispositivos

5. Móvil:
   → Zustand store se actualiza
   → Navega a ChatScreen
   → Muestra "Conectado a 192.168.1.121" ✅

6. Primera vez en móvil:
   → Propiedades almacenadas en AsyncStorage (próxima fase)
```

---

## Ciclo de vida de reconexión (ESP32)

```
CASE 1: Servidor se reinicia
┌─────────────────────────────────────┐
│ Servidor Express cae (SIGTERM)      │
│ esp32Socket.on('close')             │
└────────────┬────────────────────────┘
             │
      ┌──────▼──────┐
      │ ESP32 loop()│
      └──────┬──────┘
             │
      ┌──────▼────────────────────────┐
      │ !webSocket.isConnected()       │
      │ → tryReconnectWebSocket()      │
      │ → Intento 1: delay 2s          │
      │ → webSocket.begin(...)         │
      └──────┬────────────────────────┘
             │
      ┌──────▼────────────────────────┐
      │ Espera 2 segundos              │
      │ (backoff exponencial)          │
      └──────┬────────────────────────┘
             │
      ┌──────▼────────────────────────┐
      │ Intento 2: delay 4s            │
      │ Intento 3: delay 8s            │
      │ ...                            │
      │ Intento 10: delay 30s          │
      │ → Si sigue fallando            │
      │ → WiFi.disconnect(true)        │
      │ → WiFi.reconnect()             │
      │ → Reset counter                │
      └──────┬────────────────────────┘
             │
      ┌──────▼────────────────────────┐
      │ 🎉 CONECTADO NUEVAMENTE        │
      │ webSocketEvent(CONNECTED)      │
      │ → lastSocketIOConnected = true │
      │ → reconnectAttempts = 0        │
      └────────────────────────────────┘

CASO 2: Servidor sigue on (pero connection muere)
Igual flujo, pero en 2-30s vuelve a conectar.
```

---

## Capas de validación

```
INPUT (Desde usuario en web o móvil)
   │
   ▼ Socket.IO event 'chat:message'
┌─────────────────────────────────┐
│ CAPA 1: Socket.IO Transport     │
│ ✅ Garantiza entrega            │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ CAPA 2: Schema Validation (Zod) │
│ ✅ Validar formato              │
│ ❌ Si falla: emit('error')      │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ CAPA 3: Intent Type Detection   │
│ + Logging Estructurado          │
│ ✅ Clasifica "actuator/sensor"  │
│ ✅ Registra en debug logs       │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ CAPA 4: Command Processing      │
│ ✅ textToCommand()              │
│ ✅ callLLM()                    │
└────────┬────────────────────────┘
         │
         ▼ Backend response
┌─────────────────────────────────┐
│ CAPA 5: Response Enrichment      │
│ ✅ Incluye timestamp            │
│ ✅ Incluye intent_type          │
│ ✅ Listo para frontend          │
└────────┬────────────────────────┘
         │
         ▼ Socket.IO emit
┌─────────────────────────────────┐
│ CAPA 6: Frontend Update          │
│ ✅ React/Zustand update         │
│ ✅ UI re-render automático      │
└─────────────────────────────────┘
```

---

## Matriz de responsabilidades

| Component | Responsabilidad | Tech Stack |
|-----------|-----------------|------------|
| **ESP32** | Controlar GPIO, reportar estado, reconectarse | Arduino, WebSocket |
| **Backend** | Orquestar, validar, loguear, llevar heartbeat | Express, Socket.IO, Zod |
| **Frontend Web** | UI chat, QR generator, visualizar estado | React, Vite, Socket.IO |
| **App Móvil** | Chat móvil, QR scanner, pairing | React Native, Expo, Zustand |
| **FastAPI** | Procesamiento de LLM | FastAPI, Ollama local |
| **PostgreSQL** | Persistencia (Fase 4) | SQL, Prisma ORM |

---

## Stack tecnológico resumido

```javascript
// BACKEND
{
  runtime: "Node.js 18+",
  framework: "Express 4.x",
  realtime: "Socket.IO 4.8.3",
  validation: "Zod 4.x",
  database: "PostgreSQL (Fase 4)",
  orm: "Prisma (Fase 4)"
}

// FRONTEND WEB
{
  framework: "React 19",
  bundler: "Vite 7",
  realtime: "Socket.IO Client 4.8.3",
  qr: "qrcode.react 1.0.1"
}

// APP MÓVIL
{
  framework: "React Native",
  platform: "Expo 51",
  realtime: "Socket.IO Client 4.8.3",
  navigation: "React Navigation 6",
  state: "Zustand 4",
  camera: "Expo Camera 14",
  audio: "Expo Audio 13 (Fase 3)",
  tts: "Expo Speech 12 (Fase 3)"
}

// ESP32 FIRMWARE
{
  language: "C++",
  websocket: "WebSocketsClient",
  json: "ArduinoJson",
  wifi: "WiFi.h"
}

// CLOUD LLM
{
  engine: "Ollama (local)",
  model: "qwen2.5:1.5b-instruct",
  api: "FastAPI + Uvicorn"
}
```

---

## Roadmap de evolución

```
┌─────────────────────────────────────────────────────┐
│ Fase 1: ESTANDARIZACIÓN (✅ DONE)                   │
│ - Validación Zod                                    │
│ - Intent Type detection                             │
│ - Logging estructurado                              │
│ - Heartbeat ESP32                                   │
└─────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ Fase 2: MÓVIL + QR (✅ DONE)                        │
│ - App Expo React Native                             │
│ - Escaneo QR automático                             │
│ - Chat multimodal                                   │
│ - Socket.IO desde móvil                             │
└─────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ Fase 3: VOZ (🔄 PRÓXIMA)                            │
│ - Audio recording (expo-audio)                      │
│ - STT (Speech-to-Text)                              │
│ - TTS (Text-to-Speech)                              │
│ - Configuración de voz                              │
└─────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ Fase 4: PERSISTENCIA (📅 FUTURO)                    │
│ - PostgreSQL + Prisma                               │
│ - Historial de comandos                             │
│ - Sesiones y autenticación                          │
│ - Telemetría                                        │
└─────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ Fase 5: SENSORES (📅 FUTURO)                        │
│ - Sensores físicos (DHT22, PIR)                     │
│ - Router inteligente de intenciones                 │
│ - Automatizaciones                                  │
│ - Escalabilidad multi-dispositivo                   │
└─────────────────────────────────────────────────────┘
```

---

**Documentación actualizada**: 2026-03-22
