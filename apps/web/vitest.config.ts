import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Configuración aparte de `vite.config.ts` para que los tests no arranquen el plugin PWA:
// generar un service worker en cada pasada no aporta nada y alarga el arranque.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['./test/setup.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
});
