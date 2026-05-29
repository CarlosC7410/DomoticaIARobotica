# ⚡ Quick Start (5 minutos)

**TLDR**: Todo está implementado. Aquí está cómo correr el proyecto.

## 🚀 Arranque rápido en 4 terminales

### Terminal 1: Ollama

```bash
ollama serve
```

### Terminal 2: FastAPI / ProyectoIA

```bash
cd ProyectoIA
source .venv/bin/activate
uvicorn app:app --host 0.0.0.0 --port 8000
```

### Terminal 3: Backend + Validación

```bash
cd backend-express
npm install      # Primera vez
npm run dev
```

Ver: `http://localhost:3000/health` → `{"ok":true}`

### Terminal 4: Frontend web

```bash
cd agente
npm install      # Primera vez
npm run dev
```

Abre: `http://localhost:5173`

---

## 📱 App Móvil (Terminal 5, opcional)

```bash
cd agente-movil
npm install      # Primera vez
npm start
```

En tu móvil:
- iOS: Cámara → escanea código QR
- Android: Expo Go → Scan QR code

---

## 🛠️ ESP32 (Arduino IDE)

1. Abre `ConexionRedAI.ino`
2. **Herramientas** → **Placa** → `ESP32 Dev Module`
3. **Herramientas** → **Puerto** → Selecciona tu puerto
4. Línea ~9: Cambia `const char* host = "192.168.1.121";`
   - Usa la IP que veas en el backend log
5. **Sketch** → **Cargar** (Ctrl+U)

---

## ✅ Verificación rápida

En el navegador (`http://localhost:5173`):

1. ✏️ Escribe tu IP en el input (del backend log)
2. 👆 Presiona "Conectar"
3. ✅ Deberías ver:
   - "Servidor detectado"
   - "Dispositivos: ● ESP32"
   - "Estado LEDs: Blanco OFF..."

4. 💬 Prueba comando:
   - Escribe: `"Enciende el LED azul"`
   - El LED físico debe encenderse
   - Estado debe actualizar a "Azul ON"

---

## 🎨 QR para móvil

En el navegador web:
1. Presiona botón "Mostrar QR para móvil"
2. En tu móvil con Expo: Escanea el QR
3. ✅ Deberías ver: "Conectado a 192.168.x.x"

---

## 🐛 Si falla algo rápido

### ESP32 no se conecta
```bash
# Abre Monitor Serial en Arduino IDE
# Puerto: 115200 baud
# Deberías ver: "[WS] Conectado al servidor!"
# Si no, verifica:
# 1. SSID y password correctos (línea ~11)
# 2. IP correcta (línea ~9)
# 3. Backend corriendo (curl http://IP:3000/health)
```

### Socket.IO no funciona
```bash
# Terminal 3, habilita debug
DEBUG=true npm run dev
# Abre la consola del navegador (F12)
# Busca errores de conexión
```

### QR no escanea
```
1. Aumenta brillo de pantalla
2. Asegúrate que IP está en el código QR
3. Intenta desde diferentes ángulos
4. Si todo falla, escribe IP manualmente en la app
```

---

## 📊 Puertos importantes

```
Backend:     http://localhost:3000
FastAPI:     http://localhost:8000
Frontend:    http://localhost:5173
Expo:        exp://IP:19000
```

---

## 🎯 Qué está nuevo (Fase 1 + 2)

✅ **Fase 1:**
- Validación Zod de eventos
- Intent type detection (actuador vs sensor)
- Logging estructurado

✅ **Fase 2:**
- ✨ App Expo completa
- 📱 Escaneo QR
- 💬 Chat en tiempo real desde móvil
- 🔄 Reconexión automática ESP32

---

## 📚 Documentación completa

- `README_UPDATED.md` - Overview completo
- `INSTALACION_GUIA.md` - Instalación paso a paso
- `IMPLEMENTACION_RESUMEN.md` - Qué se implementó
- `CAMBIOS_POR_ARCHIVO.md` - Detalles técnicos
- `agente-movil/README.md` - Guía de la app móvil

---

## 🚀 Próxima fase (Fase 3)

- 🎤 Captura de audio
- 🗣️ Speech-to-Text en backend
- 🔊 Text-to-Speech desde móvil
- ⚙️ Configuración de perfil de voz

---

**¡Todo listo! 🎉**

**Tiempo total de setup**: ~5 min (sin incluir instalación de Ollama/Node)
