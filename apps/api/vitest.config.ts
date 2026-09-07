import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

// Las mismas migraciones que aplica wrangler: los tests corren contra el esquema real,
// no contra uno escrito a mano que se desincroniza a la primera migración nueva.
// La ruta es relativa porque vitest arranca en la raíz de este paquete.
const migrations = await readD1Migrations('./drizzle');

export default defineConfig({
  // Los tests corren dentro de workerd con los bindings de wrangler.toml: lo que pasa
  // el test es lo que pasará en producción, no una emulación en Node.
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/apply-migrations.ts'],
  },
});
