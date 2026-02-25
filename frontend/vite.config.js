import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Needed for Docker
    proxy: {
      '/api': {
        target: 'http://backend:8090', // 'backend' is the service name in docker-compose
        changeOrigin: true,
      }
    }
  }
})
