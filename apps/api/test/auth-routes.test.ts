import { apiErrorSchema, readSessionRefresh, userSchema } from '@gymbuddy/shared';
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { issueSessionToken } from '../src/auth/jwt';
import { createDatabase, type Database } from '../src/db/client';
import { user } from '../src/db/schema';
import { app } from '../src/index';
import { envWithSecrets } from './worker-env';

const BASE = 'https://gymbuddy.test/api/v1';
const JWT_SECRET = 'un-secreto-de-sesion-para-las-pruebas';
const USER_ID = '5b0c1d2e-3f4a-4b5c-8d6e-7f8091a2b3c4';

/** El `env` que dejaría `wrangler secret put`. */
const authEnv = (overrides: { JWT_SECRET?: string } = {}): Env =>
  envWithSecrets({ JWT_SECRET, ...overrides });

const bearer = (token: string): RequestInit => ({
  headers: { authorization: `Bearer ${token}` },
});

async function seedUser(db: Database): Promise<void> {
  await db.insert(user).values({
    id: USER_ID,
    displayName: 'Juan',
    createdAt: '2026-09-01T10:00:00.000Z',
  });
}

describe('rutas que exigen sesión', () => {
  let db: Database;

  beforeEach(async () => {
    db = createDatabase(env.DB);
    await db.delete(user);
    await seedUser(db);
  });

  it('devuelve el perfil de quien tiene sesión', async () => {
    const { token } = await issueSessionToken(USER_ID, JWT_SECRET, new Date());

    const me = await app.request(`${BASE}/auth/me`, bearer(token), authEnv());

    expect(me.status).toBe(200);
    expect(userSchema.parse(await me.json()).id).toBe(USER_ID);
  });

  it('rechaza sin cabecera, con un esquema raro y con un token falso', async () => {
    const cases: (RequestInit | undefined)[] = [
      undefined,
      { headers: { authorization: 'Basic dXNlcjpwYXNz' } },
      bearer('no-es-un-token'),
    ];

    for (const init of cases) {
      const response = await app.request(`${BASE}/auth/me`, init, authEnv());

      expect(response.status).toBe(401);
      expect(apiErrorSchema.parse(await response.json()).error.code).toBe('unauthorized');
    }
  });

  it('rechaza un token válido cuyo usuario ya no está', async () => {
    const { token } = await issueSessionToken(USER_ID, JWT_SECRET, new Date());
    await db.delete(user);

    const me = await app.request(`${BASE}/auth/me`, bearer(token), authEnv());

    expect(me.status).toBe(401);
  });

  it('no acepta un token firmado con otra clave', async () => {
    const { token } = await issueSessionToken(USER_ID, JWT_SECRET, new Date());

    const me = await app.request(
      `${BASE}/auth/me`,
      bearer(token),
      authEnv({ JWT_SECRET: 'otra-clave-distinta-de-la-que-firmo' }),
    );

    expect(me.status).toBe(401);
  });

  it('sin secreto de firma es un fallo de despliegue, no un 401', async () => {
    const { token } = await issueSessionToken(USER_ID, JWT_SECRET, new Date());

    const me = await app.request(`${BASE}/auth/me`, bearer(token), authEnv({ JWT_SECRET: '' }));

    expect(me.status).toBe(500);
    expect(apiErrorSchema.parse(await me.json()).error.code).toBe('internal_error');
  });
});

describe('la sesión se renueva al usarse', () => {
  const daysAgo = (days: number): Date => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  beforeEach(async () => {
    const db = createDatabase(env.DB);
    await db.delete(user);
    await seedUser(db);
  });

  it('no renueva la de quien acaba de entrar', async () => {
    const { token } = await issueSessionToken(USER_ID, JWT_SECRET, new Date());

    const me = await app.request(`${BASE}/auth/me`, bearer(token), authEnv());

    expect(readSessionRefresh(me.headers)).toBeNull();
  });

  it('le da un token nuevo a quien vuelve con uno a medio gastar, y el nuevo vale', async () => {
    const { token } = await issueSessionToken(USER_ID, JWT_SECRET, daysAgo(20));

    const me = await app.request(`${BASE}/auth/me`, bearer(token), authEnv());
    const renewed = readSessionRefresh(me.headers);

    expect(me.status).toBe(200);
    expect(renewed).not.toBeNull();
    expect(renewed?.token).not.toBe(token);
    // Otros treinta días por delante, contados desde ahora y no desde que se emitió el viejo.
    expect(Date.parse(renewed?.expiresAt ?? '')).toBeGreaterThan(
      Date.now() + 29 * 24 * 60 * 60 * 1000,
    );

    const again = await app.request(`${BASE}/auth/me`, bearer(renewed?.token ?? ''), authEnv());

    expect(again.status).toBe(200);
    // Recién emitido: la petición que lo estrena ya no trae otro.
    expect(readSessionRefresh(again.headers)).toBeNull();
  });

  it('no renueva nada cuando la sesión no vale: un token caducado es 401 y punto', async () => {
    const { token } = await issueSessionToken(USER_ID, JWT_SECRET, daysAgo(40));

    const me = await app.request(`${BASE}/auth/me`, bearer(token), authEnv());

    expect(me.status).toBe(401);
    expect(readSessionRefresh(me.headers)).toBeNull();
  });
});
