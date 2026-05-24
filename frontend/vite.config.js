import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/SistemaFacturacionSL/',
  server: {
    proxy: {
      '/products-data': 'http://localhost:3001',
    },
  },
})
