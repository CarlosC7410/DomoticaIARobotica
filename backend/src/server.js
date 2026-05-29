import express from "express";
import os from "os";
import cors from "cors";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { WebSocketServer, WebSocket } from "ws";
import { safeValidate, DeviceHelloSchema, ChatMessageSchema } from "./schemas.js";

const app = express();
const PORT = Number(process.env.PORT ?? 3000);
const LLM_SERVICE_URL = process.env.LLM_SERVICE_URL ?? "http://localhost:8000/chat";

app.use(cors());
app.use(express.json());

const estado = {
  entrada: false,
  cocina: false,
  bano: false,
  cuarto: false,
  foco: false,
  ventilador: false,
  puerta: 0,
  tempDHT: null,
  humedad: null,
  tempLM35: null,
  agua: false,
  distancia: 999,
  hayPersonaCerca: false,
  ultimaActualizacion: null
};

let esp32Socket = null;
const frontendClients = new Map();

const normalizeText = (text = "") =>
  text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

const wsIsOpen = (ws) => ws && ws.readyState === WebSocket.OPEN;

const getLocalIP = () => {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "localhost";
};

const buildDeviceList = () => {
  const devices = [];
  if (wsIsOpen(esp32Socket)) {
    devices.push({ socketId: "esp32-device", deviceName: "ESP32", type: "esp32" });
  }
  for (const [socketId, deviceName] of frontendClients.entries()) {
    devices.push({ socketId, deviceName, type: "frontend" });
  }
  return devices;
};

const emitState = () => {
  io.emit("estado", { ...estado });
  io.emit("led:state", {
    entrada: estado.entrada,
    cocina: estado.cocina,
    bano: estado.bano,
    cuarto: estado.cuarto,
    foco: estado.foco,
    ventilador: estado.ventilador,
    puerta: estado.puerta,
    white: estado.entrada,
    yellow: estado.cocina,
    blue: estado.bano,
    light: estado.foco
  });
  io.emit("sensores", {
    tempDHT: estado.tempDHT,
    humedad: estado.humedad,
    tempLM35: estado.tempLM35,
    agua: estado.agua,
    distancia: estado.distancia,
    hayPersonaCerca: estado.hayPersonaCerca,
    ultimaActualizacion: estado.ultimaActualizacion
  });
  io.emit("devices:update", buildDeviceList());
};

const sendToESP32 = (command) => {
  if (!wsIsOpen(esp32Socket)) return false;
  try {
    esp32Socket.send(command);
    return true;
  } catch {
    return false;
  }
};

const updateStateFromCommand = (command) => {
  switch (command) {
    case "entrada:on": estado.entrada = true; break;
    case "entrada:off": estado.entrada = false; break;
    case "cocina:on": estado.cocina = true; break;
    case "cocina:off": estado.cocina = false; break;
    case "bano:on": estado.bano = true; break;
    case "bano:off": estado.bano = false; break;
    case "cuarto:on": estado.cuarto = true; break;
    case "cuarto:off": estado.cuarto = false; break;
    case "foco:on": estado.foco = true; break;
    case "foco:off": estado.foco = false; break;
    case "ventilador:on": estado.ventilador = true; break;
    case "ventilador:off": estado.ventilador = false; break;
    case "puerta:abrir": estado.puerta = 90; break;
    case "puerta:cerrar": estado.puerta = 0; break;
  }
};

const parseDirectCommands = (rawText) => {
  const text = normalizeText(rawText);
  const commands = [];
  const wantsOn = /(enciende|encender|prende|prender|activa|activar|on)\b/.test(text);
  const wantsOff = /(apaga|apagar|desactiva|desactivar|off)\b/.test(text);

  if ((text.includes("sala") || text.includes("entrada")) && wantsOn) commands.push("entrada:on");
  if ((text.includes("sala") || text.includes("entrada")) && wantsOff) commands.push("entrada:off");

  if (text.includes("cocina") && wantsOn) commands.push("cocina:on");
  if (text.includes("cocina") && wantsOff) commands.push("cocina:off");

  if (text.includes("bano") || text.includes("baño")) {
    if (wantsOn) commands.push("bano:on");
    if (wantsOff) commands.push("bano:off");
  }

  if (text.includes("cuarto") && wantsOn) commands.push("cuarto:on");
  if (text.includes("cuarto") && wantsOff) commands.push("cuarto:off");

  if ((text.includes("foco") || text.includes("luz")) && wantsOn) commands.push("foco:on");
  if ((text.includes("foco") || text.includes("luz")) && wantsOff) commands.push("foco:off");

  if ((text.includes("ventilador") || text.includes("abanico")) && wantsOn) commands.push("ventilador:on");
  if ((text.includes("ventilador") || text.includes("abanico")) && wantsOff) commands.push("ventilador:off");

  if (text.includes("puerta") && /(abrir|abre)/.test(text)) commands.push("puerta:abrir");
  if (text.includes("puerta") && /(cerrar|cierra)/.test(text)) commands.push("puerta:cerrar");

  return commands;
};

const buildSensorReply = (rawText) => {
  const text = normalizeText(rawText);

  if (text.includes("temperatura") && (text.includes("sala") || text.includes("dht"))) {
    return estado.tempDHT == null
      ? "No tengo lectura actual de temperatura de la sala."
      : `La temperatura de la sala es ${estado.tempDHT.toFixed(1)} °C.`;
  }

  if (text.includes("humedad")) {
    return estado.humedad == null
      ? "No tengo lectura actual de humedad."
      : `La humedad de la sala es ${estado.humedad.toFixed(1)} %.`;
  }

  if (text.includes("temperatura") && text.includes("cocina")) {
    return estado.tempLM35 == null
      ? "No tengo lectura actual de temperatura de la cocina."
      : `La temperatura de la cocina es ${estado.tempLM35.toFixed(1)} °C.`;
  }

  if (text.includes("agua")) {
    return estado.agua ? "El sensor indica que sí hay agua." : "El sensor indica que no hay agua.";
  }

  if (
    text.includes("puerta") ||
    text.includes("distancia") ||
    text.includes("alguien cerca") ||
    text.includes("persona cerca")
  ) {
    if (estado.distancia == null) {
      return "No tengo lectura actual del sensor ultrasónico.";
    }

    return estado.hayPersonaCerca
      ? `Sí, hay alguien cerca de la puerta. Distancia aproximada: ${estado.distancia} cm.`
      : `No detecto a nadie cerca de la puerta. Distancia aproximada: ${estado.distancia} cm.`;
  }

  if (text.includes("estado") || text.includes("resumen")) {
    return [
      `Sala: ${estado.entrada ? "encendida" : "apagada"}`,
      `Cocina: ${estado.cocina ? "encendida" : "apagada"}`,
      `Baño: ${estado.bano ? "encendido" : "apagado"}`,
      `Cuarto: ${estado.cuarto ? "encendido" : "apagado"}`,
      `Foco: ${estado.foco ? "encendido" : "apagado"}`,
      `Ventilador: ${estado.ventilador ? "encendido" : "apagado"}`,
      `Puerta: ${estado.puerta} grados`
    ].join(" | ");
  }

  return null;
};

const callLLM = async (message) => {
  try {
    const response = await fetch(LLM_SERVICE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch {
    return { reply: "No pude comunicarme con el modelo en este momento." };
  }
};

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    esp32Connected: wsIsOpen(esp32Socket),
    devices: buildDeviceList(),
    estado
  });
});

const httpServer = createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: { origin: "*" },
  transports: ["websocket", "polling"]
});

io.on("connection", (socket) => {
  frontendClients.set(socket.id, "Frontend Web");
  socket.emit("init", {
    estado,
    devices: buildDeviceList(),
    messages: []
  });
  emitState();

  socket.on("device:hello", (payload) => {
    let deviceName = "Frontend Web";
    if (typeof payload === "string") {
      deviceName = payload;
    } else if (payload) {
      const { success, data } = safeValidate(payload, DeviceHelloSchema);
      if (success) deviceName = data.deviceName;
      else deviceName = payload.deviceName || "Frontend Web";
    }

    frontendClients.set(socket.id, deviceName);
    io.emit("devices:update", buildDeviceList());
  });

  socket.on("chat:message", async (payload) => {
    let text = "";
    if (typeof payload === "string") {
      text = payload.trim();
    } else {
      const { success, data } = safeValidate(payload, ChatMessageSchema);
      if (!success) return;
      text = data.text.trim();
    }

    if (!text) return;

    io.emit("chat:message", {
      user: "Usuario",
      text,
      timestamp: Date.now()
    });

    const directCommands = parseDirectCommands(text);

    if (directCommands.length > 0) {
      if (!wsIsOpen(esp32Socket)) {
        io.emit("chat:message", {
          user: "Sistema",
          text: "El ESP32 no está conectado en este momento.",
          timestamp: Date.now()
        });
        return;
      }

      const applied = [];

      for (const command of directCommands) {
        const ok = sendToESP32(command);
        if (ok) {
          updateStateFromCommand(command);
          applied.push(command);
        }
      }

      emitState();

      io.emit("chat:message", {
        user: "Sistema",
        text: applied.length > 0
          ? `Comando ejecutado: ${applied.join(", ")}`
          : "No fue posible ejecutar el comando.",
        timestamp: Date.now()
      });

      return;
    }

    const sensorReply = buildSensorReply(text);
    if (sensorReply) {
      io.emit("chat:message", {
        user: "Sistema",
        text: sensorReply,
        timestamp: Date.now()
      });
      return;
    }

    const llmData = await callLLM(text);
    const llmReply = llmData.reply || "No tengo una respuesta disponible en este momento.";

    io.emit("chat:message", {
      user: "IA",
      text: llmReply,
      timestamp: Date.now()
    });

    if (llmData.led_command) {
      if (!wsIsOpen(esp32Socket)) {
        io.emit("chat:message", {
          user: "Sistema",
          text: "Se generaron comandos, pero el ESP32 no está conectado.",
          timestamp: Date.now()
        });
        return;
      }
      
      const cmds = llmData.led_command;
      const applied = [];
      
      if (cmds.white !== undefined && cmds.white !== null) {
        const cmd = cmds.white ? "entrada:on" : "entrada:off";
        if (sendToESP32(cmd)) { updateStateFromCommand(cmd); applied.push(cmd); }
      }
      if (cmds.yellow !== undefined && cmds.yellow !== null) {
        const cmd = cmds.yellow ? "cocina:on" : "cocina:off";
        if (sendToESP32(cmd)) { updateStateFromCommand(cmd); applied.push(cmd); }
      }
      if (cmds.blue !== undefined && cmds.blue !== null) {
        const cmd = cmds.blue ? "bano:on" : "bano:off";
        if (sendToESP32(cmd)) { updateStateFromCommand(cmd); applied.push(cmd); }
      }
      if (cmds.cuarto !== undefined && cmds.cuarto !== null) {
        const cmd = cmds.cuarto ? "cuarto:on" : "cuarto:off";
        if (sendToESP32(cmd)) { updateStateFromCommand(cmd); applied.push(cmd); }
      }
      if (cmds.foco !== undefined && cmds.foco !== null) {
        const cmd = cmds.foco ? "foco:on" : "foco:off";
        if (sendToESP32(cmd)) { updateStateFromCommand(cmd); applied.push(cmd); }
      }
      if (cmds.ventilador !== undefined && cmds.ventilador !== null) {
        const cmd = cmds.ventilador ? "ventilador:on" : "ventilador:off";
        if (sendToESP32(cmd)) { updateStateFromCommand(cmd); applied.push(cmd); }
      }
      if (cmds.puerta !== undefined && cmds.puerta !== null) {
        const cmd = cmds.puerta === "abrir" ? "puerta:abrir" : "puerta:cerrar";
        if (sendToESP32(cmd)) { updateStateFromCommand(cmd); applied.push(cmd); }
      }
      
      if (applied.length > 0) {
        emitState();
      }
    }
  });

  socket.on("disconnect", () => {
    frontendClients.delete(socket.id);
    io.emit("devices:update", buildDeviceList());
  });
});

const wss = new WebSocketServer({
  server: httpServer,
  path: "/esp32",
  perMessageDeflate: false
});

wss.on("connection", (ws) => {
  if (wsIsOpen(esp32Socket)) {
    console.log("Cerrando conexión anterior del ESP32...");
    esp32Socket.close(1000, "Replaced by new connection");
  }

  esp32Socket = ws;
  emitState();

  ws.on("message", (raw, isBinary) => {
    if (isBinary) return;

    const text = raw.toString("utf8").trim();
    if (!text) return;

    if (text === "hello") {
      return;
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return;
    }

    if (data.type === "state") {
      estado.entrada = Number(data.entrada) === 1;
      estado.cocina = Number(data.cocina) === 1;
      estado.bano = Number(data.bano) === 1;
      estado.cuarto = Number(data.cuarto) === 1;
      estado.ventilador = Number(data.ventilador) === 1;
      estado.foco = Number(data.foco) === 1;

      if (Number.isFinite(Number(data.puerta)) && Number(data.puerta) >= 0) {
        estado.puerta = Number(data.puerta);
      }

      estado.tempDHT = Number.isFinite(Number(data.tempDHT)) ? Number(data.tempDHT) : null;
      estado.humedad = Number.isFinite(Number(data.humedad)) ? Number(data.humedad) : null;
      estado.tempLM35 = Number.isFinite(Number(data.tempLM35)) ? Number(data.tempLM35) : null;
      estado.agua = Number(data.agua) === 1;
      estado.distancia = Number.isFinite(Number(data.distancia)) ? Number(data.distancia) : 999;
      estado.hayPersonaCerca = estado.distancia > 0 && estado.distancia <= 18;
      estado.ultimaActualizacion = Date.now();

      emitState();
    }
  });

  ws.on("close", () => {
    if (esp32Socket === ws) {
      esp32Socket = null;
    }
    io.emit("devices:update", buildDeviceList());
  });

  ws.on("error", () => {});
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend activo en http://${getLocalIP()}:${PORT}`);
});

process.on("uncaughtException", (error) => console.error("[UNCAUGHT EXCEPTION]", error.message));
process.on("unhandledRejection", (error) => console.error("[UNHANDLED REJECTION]", error));
