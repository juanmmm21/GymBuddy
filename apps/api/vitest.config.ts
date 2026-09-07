import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Los tests corren dentro de workerd con los bindings de wrangler.toml: lo que pasa
  // el test es lo que pasará en producción, no una emulación en Node.
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.toml' } })],
  test: {
    include: ['test/**/*.test.ts'],
  },
});
