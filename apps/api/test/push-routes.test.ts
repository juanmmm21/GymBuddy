import { apiErrorSchema, pushConfigSchema } from '@gymbuddy/shared';
import { env } from 'cloudflare:test';
import { asc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { issueSessionToken } from '../src/auth/jwt';
import { createDatabase, type Database } from '../src/db/client';
import { pushSubscription, user } from '../src/db/schema';
import type { SecretName } from '../src/http/env';
import { app } from '../src/index';
import { MAX_PUSH_SUBSCRIPTIONS_PER_USER } from '../src/push/subscriptions';
import { envWithSecrets } from './worker-env';

const BASE = 'https://gymbuddy.test/api/v1';
const JWT_SECRET = 'un-secreto-de-sesion-para-las-pruebas';
const USER_ID = '0d6f3b1a-7c2e-4f58-9a41-2b3c4d5e6f70';
const OTHER_USER_ID = '8e1a2b3c-4d5e-4f60-8172-839405a6b7c8';

// Claves sintéticas: un punto P-256 y un secreto de 16 bytes generados para estas pruebas.
const P256DH =
  'BAgg4whJaw5eqQp4O_cggX1GRGJJ_CmGqE_0yFbeWs_ehP7pFjffJofcgZJrN19fua5DiZ5fgkFtH11xgw7GUm0';
const AUTH = 'LKrqIdpLO2NUv4Lq9iATtw';
const VAPID_PUBLIC_KEY =
  'BCZltgBrlYNek3lk5DDef_GcR7Mt19V45keKylwUMrIrosu4xn94--ID_9wnrEFE-MyrksZ61P96Ouq3Q67dsaI';
const VAPID_PRIVATE_KEY = 'vcJz5119mQ2AHp04RTAPhdItdB7yik6qSvrQxXd7K5Y';

const endpoint = (suffix: string): string => `https://web.push.apple.com/${suffix}`;

const pushEnv = (overrides: Partial<Record<SecretName, string>> = {}): Env =>
  envWithSecrets({ JWT_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, ...overrides });

async function tokenFor(userId: string): Promise<string> {
  return (await issueSessionToken(userId, JWT_SECRET, new Date())).token;
}

function send(
  method: 'GET' | 'PUT' | 'DELETE',
  path: string,
  token: string | null,
  body?: unknown,
  secrets?: Partial<Record<SecretName, string>>,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (token !== null) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';

  return Promise.resolve(
    app.request(
      `${BASE}${path}`,
      { method, headers, body: body === undefined ? null : JSON.stringify(body) },
      pushEnv(secrets),
    ),
  );
}

const subscribe = (token: string, suffix: string, auth = AUTH): Promise<Response> =>
  send('PUT', '/push/subscription', token, {
    endpoint: endpoint(suffix),
    keys: { p256dh: P256DH, auth },
    expirationTime: null,
  });

describe('rutas de la suscripción push', () => {
  let db: Database;

  beforeEach(async () => {
    db = createDatabase(env.DB);
    await db.delete(pushSubscription);
    await db.delete(user);
    await db.insert(user).values([
      { id: USER_ID, displayName: 'Juan', createdAt: '2026-09-01T10:00:00.000Z' },
      { id: OTHER_USER_ID, displayName: 'Otra', createdAt: '2026-09-01T10:00:00.000Z' },
    ]);
  });

  const rowsOf = (userId: string) =>
    db
      .select()
      .from(pushSubscription)
      .where(eq(pushSubscription.userId, userId))
      .orderBy(asc(pushSubscription.endpoint));

  describe('GET /push/config', () => {
    it('da la clave pública cuando las dos mitades están puestas', async () => {
      const response = await send('GET', '/push/config', await tokenFor(USER_ID));

      expect(response.status).toBe(200);
      expect(pushConfigSchema.parse(await response.json())).toStrictEqual({
        publicKey: VAPID_PUBLIC_KEY,
      });
    });

    it('da null sin la clave privada, sin la pública o con una pública mal copiada', async () => {
      const token = await tokenFor(USER_ID);
      const cases: Partial<Record<SecretName, string>>[] = [
        { VAPID_PRIVATE_KEY: '' },
        { VAPID_PUBLIC_KEY: '' },
        { VAPID_PUBLIC_KEY: 'no-es-una-clave' },
      ];

      for (const secrets of cases) {
        const response = await send('GET', '/push/config', token, undefined, secrets);

        expect(response.status).toBe(200);
        expect(pushConfigSchema.parse(await response.json()).publicKey).toBeNull();
      }
    });

    it('exige sesión', async () => {
      const response = await send('GET', '/push/config', null);

      expect(response.status).toBe(401);
    });
  });

  describe('PUT /push/subscription', () => {
    it('guarda la suscripción de la cuenta y repetirla la pisa sin sumar otra', async () => {
      const token = await tokenFor(USER_ID);

      expect((await subscribe(token, 'movil')).status).toBe(204);
      const renewedAuth = 'AAAAAAAAAAAAAAAAAAAAAA';
      expect((await subscribe(token, 'movil', renewedAuth)).status).toBe(204);

      const rows = await rowsOf(USER_ID);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        endpoint: endpoint('movil'),
        p256dh: P256DH,
        auth: renewedAuth,
      });
    });

    it('un endpoint de otra cuenta pasa a la de la sesión: el navegador es de quien entró', async () => {
      await subscribe(await tokenFor(OTHER_USER_ID), 'compartido');

      await subscribe(await tokenFor(USER_ID), 'compartido');

      expect(await rowsOf(OTHER_USER_ID)).toHaveLength(0);
      expect((await rowsOf(USER_ID)).map((row) => row.endpoint)).toStrictEqual([
        endpoint('compartido'),
      ]);
    });

    it('por encima del tope retira las más viejas de esa cuenta y no toca las de otra', async () => {
      await subscribe(await tokenFor(OTHER_USER_ID), 'ajena');
      const token = await tokenFor(USER_ID);
      const oldest = Array.from({ length: MAX_PUSH_SUBSCRIPTIONS_PER_USER }, (_, index) => ({
        endpoint: endpoint(`vieja-${String(index).padStart(2, '0')}`),
        userId: USER_ID,
        p256dh: P256DH,
        auth: AUTH,
        subscribedAt: `2026-09-10T08:${String(index).padStart(2, '0')}:00.000Z`,
      }));
      await db.insert(pushSubscription).values(oldest);

      expect((await subscribe(token, 'nueva')).status).toBe(204);

      const endpoints = (await rowsOf(USER_ID)).map((row) => row.endpoint);
      expect(endpoints).toHaveLength(MAX_PUSH_SUBSCRIPTIONS_PER_USER);
      expect(endpoints).toContain(endpoint('nueva'));
      expect(endpoints).not.toContain(endpoint('vieja-00'));
      expect(await rowsOf(OTHER_USER_ID)).toHaveLength(1);
    });

    it('rechaza lo que no es una suscripción: endpoint http o claves rotas', async () => {
      const token = await tokenFor(USER_ID);
      const bodies = [
        { endpoint: 'http://push.example.com/abc', keys: { p256dh: P256DH, auth: AUTH } },
        { endpoint: endpoint('movil'), keys: { p256dh: 'corta', auth: AUTH } },
        { endpoint: endpoint('movil') },
      ];

      for (const body of bodies) {
        const response = await send('PUT', '/push/subscription', token, body);

        expect(response.status).toBe(400);
        expect(apiErrorSchema.parse(await response.json()).error.code).toBe('validation_failed');
      }
      expect(await rowsOf(USER_ID)).toHaveLength(0);
    });

    it('exige sesión', async () => {
      const response = await send('PUT', '/push/subscription', null, {
        endpoint: endpoint('movil'),
        keys: { p256dh: P256DH, auth: AUTH },
      });

      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /push/subscription', () => {
    it('retira la suscripción y repetirlo sigue siendo 204', async () => {
      const token = await tokenFor(USER_ID);
      await subscribe(token, 'movil');

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await send('DELETE', '/push/subscription', token, {
          endpoint: endpoint('movil'),
        });
        expect(response.status).toBe(204);
      }

      expect(await rowsOf(USER_ID)).toHaveLength(0);
    });

    it('no retira la de otra cuenta aunque se conozca su endpoint', async () => {
      await subscribe(await tokenFor(OTHER_USER_ID), 'ajena');

      const response = await send('DELETE', '/push/subscription', await tokenFor(USER_ID), {
        endpoint: endpoint('ajena'),
      });

      expect(response.status).toBe(204);
      expect(await rowsOf(OTHER_USER_ID)).toHaveLength(1);
    });

    it('borrar la cuenta se lleva sus suscripciones', async () => {
      await subscribe(await tokenFor(USER_ID), 'movil');

      await db.delete(user).where(eq(user.id, USER_ID));

      expect(await db.select().from(pushSubscription)).toHaveLength(0);
    });
  });
});
