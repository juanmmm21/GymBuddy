/// <reference types="@cloudflare/vitest-pool-workers/types" />
import type { D1Migration } from 'cloudflare:test';

// El pool tipa `env` como `Cloudflare.Env`, así que el binding de los tests se declara
// ahí. Solo existe cuando corre vitest: lo inyecta vitest.config.ts con las migraciones.
declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
