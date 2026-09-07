import { defineConfig } from 'drizzle-kit';

// Solo se usa para `drizzle-kit generate`: las migraciones las aplica wrangler contra D1,
// así que aquí no hay credenciales ni conexión remota que configurar.
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
});
