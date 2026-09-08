import {
  apiErrorSchema,
  claimSessionResponseSchema,
  loginNonceSchema,
  userSchema,
} from '@gymbuddy/shared';
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { handleStartCommand } from '../src/bot/start';
import { createDatabase, type Database } from '../src/db/client';
import { loginNonce, user } from '../src/db/schema';
import { app } from '../src/index';
import { envWithSecrets } from './worker-env';

const BASE = 'https://gymbuddy.test/api/v1';
const JWT_SECRET = 'un-secreto-de-sesion-para-las-pruebas';

/** El `env` que dejaría `wrangler secret put`. */
const authEnv = (overrides: { JWT_SECRET?: string } = {}): Env =>
  envWithSecrets({ JWT_SECRET, ...overrides });

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

/** Simula que el usuario abre el enlace y pulsa *Start*, sin pasar por Telegram. */
async function pressStart(db: Database, nonce: string, telegramUserId = 100_001): Promise<void> {
  await handleStartCommand(db, {
    identity: {
      telegramUserId,
      firstName: 'Juan',
      username: 'juanmmm21',
      languageCode: 'es-ES',
    },
    payload: nonce,
    now: new Date(),
  });
}

describe('entrada por enlace del bot', () => {
  let db: Database;

  beforeEach(async () => {
    db = createDatabase(env.DB);
    await db.delete(loginNonce);
    await db.delete(user);
  });

  it('entrega un nonce con el enlace de Telegram ya montado', async () => {
    const response = await app.request(`${BASE}/auth/nonce`, { method: 'POST' }, authEnv());

    expect(response.status).toBe(201);
    const body = loginNonceSchema.parse(await response.json());
    // El nombre del bot lo pone el Worker: la PWA no lo lleva cableado.
    expect(body.telegramLink).toBe(`https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=${body.nonce}`);
  });

  it('responde pending mientras nadie ha pulsado Start', async () => {
    const issued = await app.request(`${BASE}/auth/nonce`, { method: 'POST' }, authEnv());
    const { nonce } = loginNonceSchema.parse(await issued.json());

    const response = await app.request(`${BASE}/auth/claim`, json({ nonce }), authEnv());

    expect(response.status).toBe(200);
    expect(claimSessionResponseSchema.parse(await response.json())).toEqual({ status: 'pending' });
  });

  it('completa el flujo: nonce, Start en Telegram, sesión y perfil', async () => {
    const issued = await app.request(`${BASE}/auth/nonce`, { method: 'POST' }, authEnv());
    const { nonce } = loginNonceSchema.parse(await issued.json());

    await pressStart(db, nonce);

    const claimed = await app.request(`${BASE}/auth/claim`, json({ nonce }), authEnv());
    const body = claimSessionResponseSchema.parse(await claimed.json());
    expect(body.status).toBe('ready');
    if (body.status !== 'ready') return;

    expect(body.session.user.telegramUserId).toBe(100_001);
    expect(body.session.user.locale).toBe('es');

    const me = await app.request(
      `${BASE}/auth/me`,
      { headers: { authorization: `Bearer ${body.session.token}` } },
      authEnv(),
    );

    expect(me.status).toBe(200);
    expect(userSchema.parse(await me.json()).id).toBe(body.session.user.id);
  });

  it('no deja canjear dos veces el mismo enlace', async () => {
    const issued = await app.request(`${BASE}/auth/nonce`, { method: 'POST' }, authEnv());
    const { nonce } = loginNonceSchema.parse(await issued.json());
    await pressStart(db, nonce);

    await app.request(`${BASE}/auth/claim`, json({ nonce }), authEnv());
    const second = await app.request(`${BASE}/auth/claim`, json({ nonce }), authEnv());

    expect(second.status).toBe(400);
    expect(apiErrorSchema.parse(await second.json()).error.code).toBe('nonce_invalid');
  });

  it('rechaza un nonce inventado con el mismo código que uno caducado', async () => {
    const response = await app.request(
      `${BASE}/auth/claim`,
      json({ nonce: 'esto-no-existe' }),
      authEnv(),
    );

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe('nonce_invalid');
  });

  it('exige el nonce en el cuerpo', async () => {
    for (const body of [{}, { nonce: '' }, 'no-es-json']) {
      const init =
        typeof body === 'string'
          ? { method: 'POST', body, headers: { 'content-type': 'application/json' } }
          : json(body);
      const response = await app.request(`${BASE}/auth/claim`, init, authEnv());

      expect(response.status).toBe(400);
      expect(apiErrorSchema.parse(await response.json()).error.code).toBe('validation_failed');
    }
  });

  it('no emite sesiones si falta el secreto de firma: es un fallo de despliegue, no un 401', async () => {
    const response = await app.request(
      `${BASE}/auth/claim`,
      json({ nonce: 'lo-que-sea' }),
      authEnv({ JWT_SECRET: '' }),
    );

    expect(response.status).toBe(500);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe('internal_error');
  });
});

describe('rutas que exigen sesión', () => {
  beforeEach(async () => {
    const db = createDatabase(env.DB);
    await db.delete(loginNonce);
    await db.delete(user);
  });

  it('rechaza sin cabecera, con un esquema raro y con un token falso', async () => {
    const cases: (RequestInit | undefined)[] = [
      undefined,
      { headers: { authorization: 'Basic dXNlcjpwYXNz' } },
      { headers: { authorization: 'Bearer no-es-un-token' } },
    ];

    for (const init of cases) {
      const response = await app.request(`${BASE}/auth/me`, init, authEnv());

      expect(response.status).toBe(401);
      expect(apiErrorSchema.parse(await response.json()).error.code).toBe('unauthorized');
    }
  });

  it('rechaza un token válido cuyo usuario ya no está', async () => {
    const db = createDatabase(env.DB);
    const issued = await app.request(`${BASE}/auth/nonce`, { method: 'POST' }, authEnv());
    const { nonce } = loginNonceSchema.parse(await issued.json());
    await pressStart(db, nonce);

    const claimed = await app.request(`${BASE}/auth/claim`, json({ nonce }), authEnv());
    const body = claimSessionResponseSchema.parse(await claimed.json());
    if (body.status !== 'ready') throw new Error('la sesión debería estar lista');

    await db.delete(user);

    const me = await app.request(
      `${BASE}/auth/me`,
      { headers: { authorization: `Bearer ${body.session.token}` } },
      authEnv(),
    );

    expect(me.status).toBe(401);
  });

  it('no acepta un token firmado con otra clave', async () => {
    const db = createDatabase(env.DB);
    const issued = await app.request(`${BASE}/auth/nonce`, { method: 'POST' }, authEnv());
    const { nonce } = loginNonceSchema.parse(await issued.json());
    await pressStart(db, nonce);

    const claimed = await app.request(`${BASE}/auth/claim`, json({ nonce }), authEnv());
    const body = claimSessionResponseSchema.parse(await claimed.json());
    if (body.status !== 'ready') throw new Error('la sesión debería estar lista');

    const me = await app.request(
      `${BASE}/auth/me`,
      { headers: { authorization: `Bearer ${body.session.token}` } },
      authEnv({ JWT_SECRET: 'otra-clave-distinta-de-la-que-firmo' }),
    );

    expect(me.status).toBe(401);
  });
});
