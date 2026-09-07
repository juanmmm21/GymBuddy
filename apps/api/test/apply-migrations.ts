import { applyD1Migrations, env } from 'cloudflare:test';

// Se aplican fuera de cualquier test para que el esquema sobreviva al aislamiento de
// almacenamiento que el pool hace entre tests; los datos de cada test sí se descartan.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
