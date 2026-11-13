import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), {
    name: 'mobile-development-routes',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const path = req.url?.split('?')[0] || '';
        if (path.startsWith('/mobile/') && !path.split('/').pop().includes('.')) req.url = '/mobile/index.html';
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        const path = req.url?.split('?')[0] || '';
        if (path.startsWith('/mobile/') && !path.split('/').pop().includes('.')) req.url = '/mobile/index.html';
        next();
      });
    },
  }],
  base: '/',
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        admin: fileURLToPath(new URL('./admin/index.html', import.meta.url)),
        mobile: fileURLToPath(new URL('./mobile/index.html', import.meta.url)),
      },
    },
  },
})
