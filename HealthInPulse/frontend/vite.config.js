import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5173,
    // Codespaces serve o app em <nome>-5173.app.github.dev
    allowedHosts: ['.app.github.dev'],
    proxy: {
      '/api':       { target: 'http://localhost:3000', changeOrigin: true },
      '/uploads':   { target: 'http://localhost:3000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3000', changeOrigin: true, ws: true },
    },
  },
});
