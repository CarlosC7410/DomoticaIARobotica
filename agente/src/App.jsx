import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import RobotFace from "./RobotFace";
import "./App.css";

const INITIAL_STATE = {
  entrada: false, cocina: false, bano: false, cuarto: false,
  foco: false, ventilador: false, puerta: 0,
  tempDHT: null, humedad: null, tempLM35: null,
  agua: false, distancia: 999, hayPersonaCerca: false, ultimaActualizacion: null
};

const VALID_EMOTIONS = new Set([
  'neutral',
  'happy',
  'excited',
  'sad',
  'surprised',
  'thinking',
  'speaking',
  'listening',
  'sleeping',
  'confused',
  'angry',
  'annoyed'
]);

const TEMPORARY_NATURAL_EMOTION_MS = 10000;
const TEMPORARY_NATURAL_EMOTIONS = new Set([
  'happy',
  'excited',
  'sad',
  'surprised',
  'confused',
  'angry',
  'annoyed'
]);

function inferEmotion(text) {
  const t = (text || '').toLowerCase();

  if (/peligroso|no voy a hacer eso|no debo|dañar|romper|destruir|quemar|lastimar/.test(t)) return 'angry';
  if (/varias veces|todav[ií]a no lo entend[ií]|d[ií]melo m[aá]s claro|molesto|serio/.test(t)) return 'annoyed';
  if (/error|no puedo|fall[oó]|imposible|no\s+(se|sé)|disculpa|lo siento|sin conexi[oó]n|perd[ií] conexi[oó]n/.test(t)) return 'sad';
  if (/jajaja|ja ja|jeje|chiste|gracioso|chistoso|risa|divertido|me encanta|incre[ií]ble|fant[aá]stico|maravilloso|muy bien|excelente|genial/.test(t)) return 'excited';
  if (/agua|presencia|alguien cerca|temperatura alta|alerta|cuidado|inesperado|sorpresa/.test(t)) return 'surprised';
  if (/no entiendo|no entend[ií]|repite|repetir|no escuch[eé]|podr[ií]as|no (entend|comprend)/.test(t)) return 'confused';
  if (/\blisto\b|perfecto|encendido|apagado|claro|con gusto|por supuesto|bienvenid|hecho|correcto/.test(t)) return 'happy';

  return 'neutral';
}

// ── TTS helpers ──────────────────────────────────────────────────────────────
const synth = window.speechSynthesis;

function getSpanishVoice() {
  const voices = synth.getVoices();
  return (
    voices.find(v => v.lang === 'es-ES') ||
    voices.find(v => v.lang === 'es-MX') ||
    voices.find(v => v.lang.startsWith('es')) ||
    null
  );
}

function speak({ text, rate = 0.95, pitch = 1.1, onStart, onEnd }) {
  if (!synth) return;
  synth.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang   = 'es-ES';
  utt.rate   = rate;
  utt.pitch  = pitch;
  utt.volume = 1;
  const voice = getSpanishVoice();
  if (voice) utt.voice = voice;
  utt.onstart = onStart || null;
  utt.onend   = onEnd   || null;
  utt.onerror = onEnd   || null;
  synth.speak(utt);
}
// ─────────────────────────────────────────────────────────────────────────────

function App() {
  const defaultHost = localStorage.getItem("serverIP") || window.location.hostname || "localhost";
  const [serverIP, setServerIP]               = useState(defaultHost);
  const [inputIP, setInputIP]                 = useState(defaultHost);
  const [serverReachable, setServerReachable] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [socket, setSocket]                   = useState(null);
  const [messages, setMessages]               = useState([]);
  const [newMsg, setNewMsg]                   = useState("");
  const [devices, setDevices]                 = useState([]);
  const [estado, setEstado]                   = useState(INITIAL_STATE);
  const [avatarEmotion, setAvatarEmotion]     = useState(() => {
    const savedEmotion = localStorage.getItem("robotEmotion");
    return VALID_EMOTIONS.has(savedEmotion) ? savedEmotion : 'neutral';
  });
  const [isThinking, setIsThinking]           = useState(false);
  const [isMuted, setIsMuted]                 = useState(false);
  const [voicesReady, setVoicesReady]         = useState(false);

  const messagesEndRef  = useRef(null);
  const emotionTimerRef = useRef();
  const recognitionRef = useRef(null);

  const isConnected = useMemo(
    () => serverReachable && socketConnected,
    [serverReachable, socketConnected]
  );

  // Cargar voces (Web Speech API las carga de forma asíncrona)
  useEffect(() => {
    const load = () => setVoicesReady(true);
    if (synth.getVoices().length > 0) { load(); return; }
    synth.addEventListener('voiceschanged', load);
    return () => synth.removeEventListener('voiceschanged', load);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const updateAvatarEmotion = (emotion) => {
    if (!VALID_EMOTIONS.has(emotion)) return;
    clearTimeout(emotionTimerRef.current);
    localStorage.setItem("robotEmotion", emotion);
    setAvatarEmotion(emotion);
  };

  const setEmotionTemporary = (emotion, ms = TEMPORARY_NATURAL_EMOTION_MS) => {
    clearTimeout(emotionTimerRef.current);
    localStorage.setItem("robotEmotion", emotion);
    setAvatarEmotion(emotion);
    emotionTimerRef.current = setTimeout(() => updateAvatarEmotion('neutral'), ms);
  };

  const parseHost = (input) =>
    input.trim().replace(/^https?:\/\//, '').split(':')[0].split('/')[0];

  const checkServer = async (ip) => {
    const host = parseHost(ip);
    if (!host) return false;
    try {
      const r = await fetch(`http://${host}:3000/health`);
      return r.ok;
    } catch { return false; }
  };

  const connectToServer = async (ip) => {
    const host = parseHost(ip);
    if (!host) return;
    const ok = await checkServer(host);
    if (!ok) {
      setServerReachable(false);
      setSocketConnected(false);
      setEmotionTemporary('sad', 3000);
      return;
    }
    localStorage.setItem("serverIP", host);
    setInputIP(host);
    setServerIP(host);
    setServerReachable(true);
  };

  useEffect(() => {
    connectToServer(defaultHost);
  }, []);

  // Limpiar TTS al desmontar
  useEffect(() => () => synth.cancel(), []);

  useEffect(() => {
    if (!serverIP || !serverReachable) return;

    const s = io(`http://${serverIP}:3000`, {
      transports: ["polling", "websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });

    setSocket(s);

    s.on("connect", () => {
      setSocketConnected(true);
      s.emit("device:hello", { deviceName: "Frontend React" });
    });

    s.on("disconnect", () => {
      setSocketConnected(false);
      setIsThinking(false);
      updateAvatarEmotion('sad');
      synth.cancel();
    });

    s.on("init",    (p)    => {
      if (p?.estado)              setEstado(p.estado);
      if (Array.isArray(p?.devices))  setDevices(p.devices);
      if (Array.isArray(p?.messages)) setMessages(p.messages);
      if (p?.robot?.emotion && VALID_EMOTIONS.has(p.robot.emotion)) {
        updateAvatarEmotion(p.robot.emotion);
      }
    });
    s.on("estado",          (e) => setEstado(prev => ({ ...prev, ...e })));
    s.on("sensores",        (e) => setEstado(prev => ({ ...prev, ...e })));
    s.on("devices:update",  (l) => setDevices(Array.isArray(l) ? l : []));

    s.on("robot:emotion", (payload) => {
      if (!payload?.emotion || !VALID_EMOTIONS.has(payload.emotion)) return;

      const isTemporary =
        payload.autoReset === true ||
        payload.mode === "natural" ||
        TEMPORARY_NATURAL_EMOTIONS.has(payload.emotion) && payload.mode === "natural";

      if (isTemporary) {
        const durationMs = Number.isFinite(Number(payload.durationMs))
          ? Number(payload.durationMs)
          : TEMPORARY_NATURAL_EMOTION_MS;
        setEmotionTemporary(payload.emotion, durationMs);
      } else {
        updateAvatarEmotion(payload.emotion);
      }
    });

    s.on("robot:status", (payload) => {
      console.log("Estado de Charsbotai:", payload);
    });

    s.on("chat:message", (msg) => {
      setMessages(prev => [...prev, msg]);

      if (msg.user !== 'Tú' && msg.user !== 'user') {
        setIsThinking(false);

        const llmEmotion = VALID_EMOTIONS.has(msg.emotion)
          ? msg.emotion
          : inferEmotion(msg.text);
        const finalEmotion = llmEmotion === 'thinking' ? 'neutral' : llmEmotion;

        if (!isMuted && msg.text) {
          // Avatar habla → al terminar muestra la emoción del LLM
          updateAvatarEmotion('speaking');
          speak({
            text: msg.text,
            onEnd: () => setEmotionTemporary(finalEmotion, TEMPORARY_NATURAL_EMOTION_MS),
          });
        } else {
          setEmotionTemporary(finalEmotion, TEMPORARY_NATURAL_EMOTION_MS);
        }
      }
    });

    return () => {
      s.disconnect();
      setSocket(null);
      setSocketConnected(false);
      synth.cancel();
    };
  }, [serverIP, serverReachable, isMuted]);

  const handleSendMessage = () => {
    if (!newMsg.trim() || !socket) return;
    synth.cancel(); // cortar TTS si ARIA estaba hablando
    socket.emit("chat:message", { text: newMsg.trim() });
    setNewMsg("");
    setIsThinking(true);
    updateAvatarEmotion('thinking');
  };

  const sendMessageText = (text) => {
    if (!text.trim() || !socket) {
      setEmotionTemporary("sad", 3000);
      return;
    }

    synth.cancel();
    socket.emit("chat:message", { text: text.trim() });
    setIsThinking(true);
    updateAvatarEmotion("thinking");
  };

  const startListening = () => {
    const robotBusy =
      avatarEmotion === "speaking" ||
      avatarEmotion === "thinking" ||
      avatarEmotion === "listening" ||
      isThinking ||
      (recognitionRef.current && typeof recognitionRef.current.stop === "function") ||
      synth.speaking;

    if (robotBusy) {
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setEmotionTemporary("sad", 3000);
      speak({
        text: "Lo siento, este navegador no permite reconocimiento de voz.",
        onEnd: () => setEmotionTemporary("sad", 3000),
      });
      return;
    }

    if (!socketConnected) {
      setEmotionTemporary("sad", 3000);
      speak({
        text: "Todavía no estoy conectada al servidor.",
        onEnd: () => setEmotionTemporary("sad", 3000),
      });
      return;
    }

    synth.cancel();

    const recognition = new SpeechRecognition();
    recognition.lang = "es-MX";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setIsThinking(false);
      updateAvatarEmotion("listening");
      socket?.emit("robot:emotion", { emotion: "listening", mode: "state" });
    };

    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      console.log("Usuario dijo:", text);
      updateAvatarEmotion("thinking");
      sendMessageText(text);
    };

    recognition.onerror = (event) => {
      console.log("Error de reconocimiento:", event.error);
      recognitionRef.current = null;
      setEmotionTemporary("confused", 3000);
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      if (!isThinking) {
        setEmotionTemporary("neutral", 1500);
      }
    };

    recognition.start();
  };

  const toggleMute = () => {
    if (!isMuted) synth.cancel();
    setIsMuted(m => !m);
  };

  const faceOnlyMode = true;

  if (faceOnlyMode) {
    return (
      <RobotFace
        emotion={avatarEmotion}
        speaking={avatarEmotion === "speaking"}
        onClick={startListening}
      />
    );
  }

  return (
    <div className="app-layout">
      {/* ── Avatar panel (left) ── */}
      <aside className="avatar-panel">
        <div className="avatar-panel-title">ARIA</div>

        <RobotFace emotion={avatarEmotion} speaking={avatarEmotion === "speaking"} />

        <div className="avatar-conn-status">
          <span className={`conn-dot ${isConnected ? 'conn-on' : 'conn-off'}`} />
          {isConnected ? 'Online' : 'Offline'}
        </div>

        <button className={`mute-btn ${isMuted ? 'muted' : ''}`} onClick={toggleMute} title={isMuted ? 'Activar voz' : 'Silenciar voz'}>
          {isMuted ? '🔇 Silenciado' : '🔊 Con voz'}
        </button>

        {!voicesReady && (
          <span className="voices-hint">cargando voces...</span>
        )}
      </aside>

      {/* ── Main panel (right) ── */}
      <main className="main-panel">
        <h1>Control IoT + IA</h1>

        <section className="card">
          <h2>Conectar al servidor</h2>
          <div className="chat-input">
            <input
              type="text"
              placeholder="IP del servidor (ej: localhost o 192.168.1.10)"
              value={inputIP}
              onChange={(e) => setInputIP(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && connectToServer(inputIP)}
            />
            <button onClick={() => connectToServer(inputIP)}>Conectar</button>
          </div>
          <div className="info-box">
            <p><strong>Servidor:</strong> {serverIP || "Sin configurar"}</p>
            <p><strong>Conexión:</strong> {isConnected ? "✓ Activa" : "✗ Desconectada"}</p>
            <p><strong>Dispositivos:</strong>{" "}
              {devices.length === 0 ? "Ninguno" : devices.map(d => d.deviceName).join(", ")}
            </p>
          </div>
        </section>

        <section className="status-grid">
          <div className="status-box">Sala      <strong className={estado.entrada    ? 'on':'off'}>{estado.entrada    ? 'ON':'OFF'}</strong></div>
          <div className="status-box">Cocina    <strong className={estado.cocina     ? 'on':'off'}>{estado.cocina     ? 'ON':'OFF'}</strong></div>
          <div className="status-box">Baño      <strong className={estado.bano       ? 'on':'off'}>{estado.bano       ? 'ON':'OFF'}</strong></div>
          <div className="status-box">Cuarto    <strong className={estado.cuarto     ? 'on':'off'}>{estado.cuarto     ? 'ON':'OFF'}</strong></div>
          <div className="status-box">Foco      <strong className={estado.foco       ? 'on':'off'}>{estado.foco       ? 'ON':'OFF'}</strong></div>
          <div className="status-box">Ventilador<strong className={estado.ventilador ? 'on':'off'}>{estado.ventilador ? 'ON':'OFF'}</strong></div>
          <div className="status-box">Puerta    <strong>{estado.puerta}°</strong></div>
          <div className="status-box">Agua      <strong className={estado.agua       ? 'on':'off'}>{estado.agua       ? 'Sí':'No'}</strong></div>
          <div className="status-box">T° Sala   <strong>{estado.tempDHT  ?? '--'} °C</strong></div>
          <div className="status-box">Humedad   <strong>{estado.humedad  ?? '--'} %</strong></div>
          <div className="status-box">T° Cocina <strong>{estado.tempLM35 ?? '--'} °C</strong></div>
          <div className="status-box">Persona   <strong className={estado.hayPersonaCerca ? 'on':'off'}>{estado.hayPersonaCerca ? 'Sí':'No'}</strong></div>
        </section>

        <section className="card">
          <h2>Chat</h2>
          <div className="chat-messages">
            {messages.map((m, idx) => (
              <div key={idx} className={`msg ${m.user === 'Tú' || m.user === 'user' ? 'msg-user' : 'msg-ia'}`}>
                <span className="msg-author">{m.user}</span>
                <span className="msg-text">{m.text}</span>
              </div>
            ))}
            {isThinking && (
              <div className="msg msg-ia msg-thinking">
                <span className="msg-author">ARIA</span>
                <span className="typing-dots"><span /><span /><span /></span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input">
            <input
              type="text"
              value={newMsg}
              onChange={(e) => setNewMsg(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              placeholder={isConnected ? "Escribe un mensaje..." : "Conecta al servidor primero"}
              disabled={!socket}
            />
            <button onClick={handleSendMessage} disabled={!socket || !newMsg.trim()}>
              Enviar
            </button>
          </div>
        </section>
      </main>
    </div>
  );
  
}

export default App;
