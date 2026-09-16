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
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: migrations,
          // Un par VAPID sintético, solo de pruebas. La alarma del aviso de descanso es un Durable
          // Object que lee los secretos de su propio `env`, y ahí no llega `envWithSecrets`.
          VAPID_PUBLIC_KEY:
            'BCZltgBrlYNek3lk5DDef_GcR7Mt19V45keKylwUMrIrosu4xn94--ID_9wnrEFE-MyrksZ61P96Ouq3Q67dsaI',
          VAPID_PRIVATE_KEY: 'vcJz5119mQ2AHp04RTAPhdItdB7yik6qSvrQxXd7K5Y',
        },
      },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/apply-migrations.ts'],
  },
});
