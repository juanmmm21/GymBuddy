import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/** Puerto de `wrangler dev`; en desarrollo la PWA habla con el Worker a través del proxy. */
const LOCAL_WORKER_URL = 'http://127.0.0.1:8787';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'GymBuddy',
        short_name: 'GymBuddy',
        description: 'Registro de entrenamiento personal',
        lang: 'es',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        // Los colores del manifiesto son los del tema claro: el manifiesto no sabe de
        // esquemas y el sistema los usa para la pantalla de arranque y la barra de estado.
        background_color: '#f4f5f7',
        theme_color: '#f4f5f7',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // El shell se precachea entero; la caché de GIFs y la cola offline llegan en la fase 13.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Una petición a la API que falle no puede responderse con el index.html del shell.
        navigateFallbackDenylist: [/^\/api\//, /^\/telegram\//],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: LOCAL_WORKER_URL, changeOrigin: true },
    },
  },
});
