import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import os from 'os'

const getLocalIP = () => {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return 'localhost'
}

const localIP = getLocalIP()

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    middlewareMode: false,
  },
  preview: {
    host: '0.0.0.0',
  }
})
