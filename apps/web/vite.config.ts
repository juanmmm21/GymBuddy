import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
// Estas opciones leen el tag del catálogo de `@gymbuddy/shared`, que se publica como TypeScript sin
// compilar. Por eso los scripts arrancan Vite con `--configLoader runner`: el cargador por
// defecto deja el paquete fuera del bundle de la configuración y Node no resuelve sus imports.
import { colors } from './src/design/tokens';
import {
  PUSH_SW_ENTRY_NAME,
  PUSH_SW_FILE_NAME,
  workboxOptions,
} from './src/offline/service-worker';

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
        background_color: colors.light.canvas,
        theme_color: colors.light.canvas,
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: workboxOptions,
      devOptions: { enabled: false },
    }),
  ],
  build: {
    rolldownOptions: {
      input: {
        index: 'index.html',
        [PUSH_SW_ENTRY_NAME]: 'src/offline/push-sw.ts',
      },
      output: {
        // El manejador del push va a la raíz con nombre fijo: el `sw.js` lo carga con
        // `importScripts` y no puede saber un hash.
        entryFileNames: (chunk) =>
          chunk.name === PUSH_SW_ENTRY_NAME ? PUSH_SW_FILE_NAME : 'assets/[name]-[hash].js',
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: LOCAL_WORKER_URL, changeOrigin: true },
    },
  },
});
