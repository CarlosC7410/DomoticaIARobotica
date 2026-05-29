import { create } from 'zustand';
import { io } from 'socket.io-client';

export const useIoTStore = create((set, get) => ({
  // Conexión
  socket: null,
  serverIP: '',
  isConnected: false,
  pairingToken: '',
  sessionId: '',

  // Estado de LEDs
  ledState: {
    white: false,
    yellow: false,
    blue: false,
    light: false,
  },

  // Chat y mensajes
  messages: [],
  devices: [],

  // Estado de la app
  isLoading: false,
  error: null,

  // Acciones
  setServerIP: (ip) => set({ serverIP: ip }),

  connectToServer: (serverIP) => {
    const state = get();

    // Si ya está conectado, desconectar primero
    if (state.socket) {
      state.socket.disconnect();
    }

    const newSocket = io(`http://${serverIP}:3000`, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    newSocket.on('connect', () => {
      console.log('[Socket.IO] Conectado:', newSocket.id);
      set({ isConnected: true, socket: newSocket, error: null });

      // Registrarse como cliente móvil
      newSocket.emit('device:hello', 'agente-movil');
    });

    newSocket.on('disconnect', () => {
      console.log('[Socket.IO] Desconectado');
      set({ isConnected: false });
    });

    newSocket.on('chat:message', (msg) => {
      set((state) => ({
        messages: [...state.messages, msg],
      }));
    });

    newSocket.on('led:state', (state) => {
      set({ ledState: state });
    });

    newSocket.on('devices:update', (devList) => {
      set({ devices: devList ?? [] });
    });

    newSocket.on('connect_error', (error) => {
      console.error('[Socket.IO] Error:', error);
      set({ error: error.message });
    });

    set({ socket: newSocket, serverIP, isLoading: false });
  },

  sendMessage: (text) => {
    const state = get();
    if (!state.socket || !state.isConnected) return;

    // Enviar como objeto explícitamente para consistencia
    state.socket.emit('chat:message', { text: text.trim() });
  },

  disconnect: () => {
    const state = get();
    if (state.socket) {
      state.socket.disconnect();
      set({
        socket: null,
        isConnected: false,
        serverIP: '',
        messages: [],
        devices: [],
      });
    }
  },

  clearMessages: () => set({ messages: [] }),
}));
