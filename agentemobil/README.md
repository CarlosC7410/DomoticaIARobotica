# IoT Agent Mobile - App Expo

App React Native con Expo para controlar dispositivos IoT por voz y chat.

## Características

✨ **Fase 2 Multimodal:**
- Escaneo QR para descubrimiento automático del servidor
- Chat en tiempo real con Socket.IO
- Visualización de estado de LEDs
- Detección automática de intenciones (actuador vs sensor)

🎯 **Próximamente - Fase 3:**
- Captura de audio y grabación
- STT (Speech-to-Text)
- TTS (Text-to-Speech) para respuestas
- Configuración de perfil de voz

## Requisitos

- Node.js 18+
- npm o yarn
- Expo CLI instalado: `npm install -g eas-cli`
- Un móvil con Expo Go (iOS) o Android

## Instalación

```bash
cd agente-movil
npm install
```

## Uso

### Desde Expo Go (recomendado para desarrollo)

```bash
npm start
```

Esto abre un servidor Expo en `http://localhost:19000`. Luego:

**iOS:** Abre la cámara y escanea el código QR
**Android:** Abre Expo Go, toca "Scan QR code" y escanea

### En Android (emulador o físico)

```bash
npm run android
```

### En iOS (requiere macOS)

```bash
npm run ios
```

## Cómo usar la app

### 1. Escanear QR (Pareado)

Antes de abrir la app, tu servidor debe mostrar un código QR con su IP.

**En el frontend web (`agente`):**
- Conecta al servidor
- En la interfaz debe haber un botón "Mostrar QR" (próximamente)

**O manualmente:**
- El código QR debe contener la IP: `192.168.1.121`
- La app escanea automáticamente y se conecta

### 2. Chat y Comandos

Una vez conectado, puedes:

**Comandos de actuador (LEDs):**
```
"Enciende el LED azul"
"Apaga el LED blanco"
"Prende los LEDs"
```

**Consultas de sensor:**
```
"¿Cuál es el estado de los LEDs?"
"Dime el estado del foco"
```

**Preguntas generales:**
```
"¿Qué hora es?"
"Cuéntame chistes"
```

### 3. Estados de LEDs

En la parte superior de la pantalla de chat ves el estado actual:
- **Blanco, Amarillo, Azul, Foco** → ON/OFF

Cada vez que cambias el estado desde la app, se actualiza en tiempo real.

## Estructura del Proyecto

```
agente-movil/
├── index.js                    # Punto de entrada
├── package.json
├── app.json                    # Configuración de Expo
├── src/
│   ├── App.jsx                 # Navegador principal
│   ├── store.js                # Estado global con Zustand + Socket.IO
│   └── screens/
│       ├── QRScannerScreen.jsx # Escaneo QR y pareado
│       └── ChatScreen.jsx      # Chat principal
└── .gitignore
```

## Configuración

### IP del servidor

La app detecta automáticamente la IP del servidor escaneando un QR.

Para debug manual, puedes editar `src/store.js` y hardcodear la IP:

```javascript
// En connectToServer()
const IP = '192.168.1.121';
```

### Permisos

La app solicita permisos para:
- **Cámara**: Escaneo de códigos QR
- **Micrófono**: Para STT (en Fase 3)

Estos están configurados en `app.json` bajo `plugins`.

## Troubleshooting

### App no se conecta

1. Verifica que el backend está corriendo: `http://<IP>:3000/health`
2. Asegúrate que móvil y servidor están en la misma red WiFi
3. Intenta con la IP manualmente en `src/store.js`

### Cámara no funciona

```bash
# Reinstalar módulos de cámara
npm install expo-camera
npm start
```

### Socket.IO no conecta

En Debug mode (consola):
```bash
DEBUG=true npm start
```

Verifica que el servidor está en `http://<IP>:3000`.

## Próximas características (Fase 3)

- Audio recording e input por voz
- STT local (via Vosk o API)
- TTS (voz del agente)
- Configuración de perfil de voz (pitch, rate, voice)
- Persistencia de sesiones

## API Reference

### Eventos Socket.IO

**Cliente emite:**
```javascript
socket.emit('chat:message', 'Enciende el LED azul');
socket.emit('device:hello', 'agente-movil');
```

**Cliente recibe:**
```javascript
socket.on('led:state', (state) => {...});
socket.on('chat:message', (msg) => {...});
socket.on('devices:update', (devices) => {...});
```

## Documentación de referencia

- [Expo Camera](https://docs.expo.dev/versions/latest/sdk/camera/)
- [Expo Audio](https://docs.expo.dev/versions/latest/sdk/audio/)
- [Socket.IO Client](https://socket.io/docs/v4/client-api/)
- [React Navigation](https://reactnavigation.org/)
- [Zustand](https://github.com/pmndrs/zustand)

---

**Estado**: Fase 2 en progreso
**Última actualización**: 2026-03-22
