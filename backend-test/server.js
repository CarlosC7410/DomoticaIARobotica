import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app        = express();
const httpServer = createServer(app);
const io         = new Server(httpServer, { cors: { origin: '*' } });

// CORS para rutas HTTP normales (el navegador lo requiere)
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

const LLM_URL = process.env.LLM_URL || 'http://localhost:8000/chat';
const PORT    = process.env.PORT    || 3001;

// Estado inicial de los dispositivos
let estado = {
  entrada: false, cocina: false, bano: false,
  cuarto: false, foco: false, ventilador: false,
  puerta: 0,
  tempDHT: null, humedad: null, tempLM35: null,
  agua: false, distancia: 999, hayPersonaCerca: false
};

const devices   = [];
const history   = [];

// Mapeo FastAPI key → estado key
const LED_MAP = {
  white: 'entrada', yellow: 'cocina', blue: 'bano',
  cuarto: 'cuarto', foco: 'foco', ventilador: 'ventilador'
};

app.get('/health', (_req, res) => res.json({ ok: true }));

io.on('connection', (socket) => {
  console.log(`[+] Cliente conectado: ${socket.id}`);

  // Enviar estado inicial
  socket.emit('init', { estado, devices, messages: history });

  socket.on('device:hello', ({ deviceName }) => {
    if (!devices.find(d => d.id === socket.id)) {
      devices.push({ id: socket.id, deviceName });
    }
    io.emit('devices:update', devices);
    console.log(`[device] ${deviceName} registrado`);
  });

  socket.on('disconnect', () => {
    const idx = devices.findIndex(d => d.id === socket.id);
    if (idx !== -1) devices.splice(idx, 1);
    io.emit('devices:update', devices);
    console.log(`[-] Cliente desconectado: ${socket.id}`);
  });

  socket.on('chat:message', async ({ text }) => {
    if (!text?.trim()) return;

    // Emitir mensaje del usuario
    const userMsg = { user: 'Tú', text: text.trim(), timestamp: Date.now() };
    history.push(userMsg);
    io.emit('chat:message', userMsg);

    console.log(`[chat] Usuario: ${text}`);

    // Llamar al LLM (FastAPI)
    let reply = 'Error al conectar con el LLM.';
    let emotion = 'sad';
    let led_command = null;

    try {
      const res  = await fetch(LLM_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: text.trim() }),
      });
      const data = await res.json();
      reply       = data.reply   || reply;
      emotion     = data.emotion || 'neutral';
      led_command = data.led_command || null;
    } catch (err) {
      console.error('[LLM] Error:', err.message);
    }

    // Aplicar comandos de dispositivos si los hay
    if (led_command) {
      for (const [key, val] of Object.entries(led_command)) {
        if (LED_MAP[key] && typeof val === 'boolean') {
          estado[LED_MAP[key]] = val;
        }
        if (key === 'puerta' && (val === 'abrir' || val === 'cerrar')) {
          estado.puerta = val === 'abrir' ? 90 : 0;
        }
      }
      io.emit('estado', estado);
      console.log(`[estado] Actualizado:`, estado);
    }

    // Emitir respuesta de ARIA con emotion
    const iaMsg = { user: 'ARIA', text: reply, emotion, timestamp: Date.now() };
    history.push(iaMsg);
    io.emit('chat:message', iaMsg);

    console.log(`[chat] ARIA (${emotion}): ${reply}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`\n  Backend-test corriendo en http://localhost:${PORT}`);
  console.log(`  Health:   http://localhost:${PORT}/health`);
  console.log(`  LLM URL:  ${LLM_URL}\n`);
});
