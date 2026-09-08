import { apiErrorSchema, catalogSyncStatusSchema, catalogSyncStepSchema } from '@gymbuddy/shared';
import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/index';
import { createDatabase, type Database } from '../src/db/client';
import { catalogExercise, catalogSyncState } from '../src/db/schema';
import { createCatalogFetch } from './catalog-fixtures';

const SYNC_URL = 'https://gymbuddy.test/api/v1/admin/catalog/sync';
const STATUS_URL = 'https://gymbuddy.test/api/v1/admin/catalog/status';
const ADMIN_TOKEN = 'un-secreto-de-pruebas';

const withToken = (token: string): RequestInit => ({
  method: 'POST',
  headers: { 'x-gymbuddy-admin-token': token },
});

/** El `env` del Worker con el secreto puesto, como lo dejaría `wrangler secret put`. */
const adminEnv = (): Env => ({ DB: env.DB, ADMIN_TOKEN });

describe('rutas de administración del catálogo', () => {
  let db: Database;

  beforeEach(async () => {
    db = createDatabase(env.DB);
    await db.delete(catalogSyncState);
    await db.delete(catalogExercise);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('no existe si el secreto no está configurado: un olvido no puede abrir el agujero', async () => {
    const response = await app.request(SYNC_URL, withToken(ADMIN_TOKEN), { DB: env.DB });

    expect(response.status).toBe(404);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe('not_found');
  });

  it('no existe sin la cabecera del secreto', async () => {
    const response = await app.request(SYNC_URL, { method: 'POST' }, adminEnv());

    expect(response.status).toBe(404);
  });

  it('no distingue un secreto equivocado de una ruta que no existe', async () => {
    const response = await app.request(SYNC_URL, withToken('otro-secreto'), adminEnv());

    expect(response.status).toBe(404);
  });

  it('avanza un músculo por llamada cuando el secreto es correcto', async () => {
    const cdn = createCatalogFetch();
    vi.stubGlobal('fetch', cdn.fetch);

    const response = await app.request(SYNC_URL, withToken(ADMIN_TOKEN), adminEnv());

    expect(response.status).toBe(200);
    const step = catalogSyncStepSchema.parse(await response.json());
    expect(step.syncedMuscle).toBe('abductors');
    expect(step.exercisesUpserted).toBe(1);
    expect(step.status.nextMuscle).toBe('abs');
  });

  it('devuelve catalog_unavailable cuando el origen no responde', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('down', { status: 503 })));

    const response = await app.request(SYNC_URL, withToken(ADMIN_TOKEN), adminEnv());

    // 503 y no 500: el que falla es el CDN de terceros, no el Worker.
    expect(response.status).toBe(503);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe('catalog_unavailable');
  });

  it('deja el fallo del origen anotado en el estado del ciclo', async () => {
    const cdn = createCatalogFetch();
    vi.stubGlobal('fetch', cdn.fetch);
    await app.request(SYNC_URL, withToken(ADMIN_TOKEN), adminEnv());

    vi.stubGlobal('fetch', () => Promise.resolve(new Response('down', { status: 500 })));
    await app.request(SYNC_URL, withToken(ADMIN_TOKEN), adminEnv());

    const [state] = await db.select().from(catalogSyncState);
    expect(state?.lastError).toContain('500');
    // El puntero no se mueve: el músculo que falló se reintenta, no se salta.
    expect(state?.nextMuscle).toBe('abs');
  });

  it('informa del estado del snapshot sin tocar el origen', async () => {
    const cdn = createCatalogFetch();
    vi.stubGlobal('fetch', cdn.fetch);
    await app.request(SYNC_URL, withToken(ADMIN_TOKEN), adminEnv());

    const callsBefore = cdn.calls.length;
    const response = await app.request(
      STATUS_URL,
      { headers: { 'x-gymbuddy-admin-token': ADMIN_TOKEN } },
      adminEnv(),
    );

    expect(response.status).toBe(200);
    const status = catalogSyncStatusSchema.parse(await response.json());
    expect(status.exerciseCount).toBe(1);
    expect(cdn.calls).toHaveLength(callsBefore);
  });

  it('devuelve not_found al pedir el estado antes de la primera sincronización', async () => {
    const response = await app.request(
      STATUS_URL,
      { headers: { 'x-gymbuddy-admin-token': ADMIN_TOKEN } },
      adminEnv(),
    );

    expect(response.status).toBe(404);
  });
});
