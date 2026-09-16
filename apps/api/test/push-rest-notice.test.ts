import { apiErrorSchema, MAX_REST_NOTICE_DELAY_SECONDS } from '@gymbuddy/shared';
import { env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { issueSessionToken } from '../src/auth/jwt';
import { createDatabase, type Database } from '../src/db/client';
import { pushSubscription, user, workoutSession } from '../src/db/schema';
import type { SecretName } from '../src/http/env';
import { app } from '../src/index';
import {
  deliverRestNotice,
  REST_NOTICE_TTL_SECONDS,
  type ScheduledRestNotice,
} from '../src/push/rest-notice';
import type { RestNoticeAlarm } from '../src/push/rest-notice-alarm';
import { decodeBase64Url, readVapidKeys, vapidAuthorization } from '../src/push/web-push';
import { envWithSecrets } from './worker-env';

const BASE = 'https://gymbuddy.test/api/v1';
const JWT_SECRET = 'un-secreto-de-sesion-para-las-pruebas';
const USER_ID = '3b7c9d1e-2f4a-4b6c-8d0e-1f2a3b4c5d6e';
const OTHER_USER_ID = '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d';
const OPEN_SESSION_ID = 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e';
const CLOSED_SESSION_ID = 'c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f';
const OTHER_SESSION_ID = 'd3e4f5a6-b7c8-4d9e-8f1a-2b3c4d5e6f7a';

// Claves sintéticas: el mismo par VAPID de las pruebas de la suscripción y un navegador inventado.
const VAPID_PUBLIC_KEY =
  'BCZltgBrlYNek3lk5DDef_GcR7Mt19V45keKylwUMrIrosu4xn94--ID_9wnrEFE-MyrksZ61P96Ouq3Q67dsaI';
const VAPID_PRIVATE_KEY = 'vcJz5119mQ2AHp04RTAPhdItdB7yik6qSvrQxXd7K5Y';
const P256DH =
  'BAgg4whJaw5eqQp4O_cggX1GRGJJ_CmGqE_0yFbeWs_ehP7pFjffJofcgZJrN19fua5DiZ5fgkFtH11xgw7GUm0';
const AUTH = 'LKrqIdpLO2NUv4Lq9iATtw';

const pushEnv = (overrides: Partial<Record<SecretName, string>> = {}): Env =>
  envWithSecrets({ JWT_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, ...overrides });

const alarmOf = (userId: string): DurableObjectStub<RestNoticeAlarm> =>
  env.REST_NOTICE.get(env.REST_NOTICE.idFromName(userId));

const scheduledAlarmAt = (userId: string): Promise<number | null> =>
  runInDurableObject(alarmOf(userId), (_instance, state) => state.storage.getAlarm());

const secondsFromNow = (seconds: number): string =>
  new Date(Date.now() + seconds * 1000).toISOString();

interface RecordedPush {
  readonly url: string;
  readonly headers: Headers;
}

/**
 * Un servicio de push falso: responde por endpoint y apunta lo que le llega. Nada toca la red.
 *
 * Imita también la comprobación del `fetch` de Workers, que lanza «Illegal invocation» si se llama
 * como método de otro objeto (`options.fetchImpl(...)`). Un falso sin ella dejó pasar a producción
 * una alarma que sonaba y nunca mandaba el aviso.
 */
function fakePushService(statusByEndpoint: Record<string, number | 'throw'>) {
  const received: RecordedPush[] = [];
  const fetchImpl = vi.fn(function (
    this: unknown,
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    if (this !== undefined && this !== globalThis) {
      throw new TypeError('Illegal invocation: function called with incorrect `this` reference');
    }
    const url = input instanceof Request ? input.url : String(input);
    received.push({ url, headers: new Headers(init?.headers) });
    const status = statusByEndpoint[url] ?? 201;
    if (status === 'throw') return Promise.reject(new TypeError('sin red'));

    return Promise.resolve(new Response(null, { status }));
  });

  return { received, fetchImpl: fetchImpl as unknown as typeof fetch };
}

async function tokenFor(userId: string): Promise<string> {
  return (await issueSessionToken(userId, JWT_SECRET, new Date())).token;
}

async function send(
  method: 'PUT' | 'DELETE',
  token: string | null,
  body?: unknown,
  secrets?: Partial<Record<SecretName, string>>,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (token !== null) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';

  return app.request(
    `${BASE}/push/rest-notice`,
    { method, headers, body: body === undefined ? null : JSON.stringify(body) },
    pushEnv(secrets),
  );
}

describe('aviso de fin de descanso', () => {
  let db: Database;

  const subscribe = (userId: string, suffix: string): Promise<unknown> =>
    db.insert(pushSubscription).values({
      endpoint: `https://web.push.apple.com/${suffix}`,
      userId,
      p256dh: P256DH,
      auth: AUTH,
      subscribedAt: '2026-09-16T10:00:00.000Z',
    });

  beforeEach(async () => {
    db = createDatabase(env.DB);
    await db.delete(pushSubscription);
    await db.delete(workoutSession);
    await db.delete(user);
    await db.insert(user).values([
      { id: USER_ID, displayName: 'Juan', createdAt: '2026-09-01T10:00:00.000Z' },
      { id: OTHER_USER_ID, displayName: 'Otra', createdAt: '2026-09-01T10:00:00.000Z' },
    ]);
    await db.insert(workoutSession).values([
      { id: OPEN_SESSION_ID, userId: USER_ID, startedAt: new Date().toISOString() },
      {
        id: CLOSED_SESSION_ID,
        userId: USER_ID,
        startedAt: '2026-09-15T18:00:00.000Z',
        endedAt: '2026-09-15T19:00:00.000Z',
      },
      { id: OTHER_SESSION_ID, userId: OTHER_USER_ID, startedAt: new Date().toISOString() },
    ]);
    await alarmOf(USER_ID).cancel();
    await alarmOf(OTHER_USER_ID).cancel();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('firma VAPID', () => {
    it('es un JWT ES256 que verifica con la clave pública, para el origen del servicio', async () => {
      const keys = readVapidKeys(pushEnv());
      if (keys === null) throw new Error('Las claves de prueba deberían leerse');
      const now = new Date('2026-09-16T18:00:00.000Z');

      const header = await vapidAuthorization(
        'https://web.push.apple.com/abc?x=1',
        keys,
        'https://gymbuddy.test',
        now,
      );

      const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
      if (match === null) throw new Error(`Cabecera inesperada: ${header}`);
      const [, encodedHeader = '', encodedClaims = '', signature = '', publicKey = ''] = match;
      expect(publicKey).toBe(VAPID_PUBLIC_KEY);

      const decode = (part: string): unknown =>
        JSON.parse(new TextDecoder().decode(decodeBase64Url(part)));
      expect(decode(encodedHeader)).toStrictEqual({ typ: 'JWT', alg: 'ES256' });
      expect(decode(encodedClaims)).toStrictEqual({
        aud: 'https://web.push.apple.com',
        exp: Math.floor(now.getTime() / 1000) + 12 * 60 * 60,
        sub: 'https://gymbuddy.test',
      });

      const verifier = await crypto.subtle.importKey(
        'raw',
        decodeBase64Url(VAPID_PUBLIC_KEY),
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify'],
      );
      const valid = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        verifier,
        decodeBase64Url(signature),
        new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`),
      );
      expect(valid).toBe(true);
    });
  });

  describe('deliverRestNotice', () => {
    const notice: ScheduledRestNotice = {
      userId: USER_ID,
      sessionId: OPEN_SESSION_ID,
      endsAt: '2026-09-16T18:00:00.000Z',
    };
    const atEnd = new Date(notice.endsAt);

    it('manda un aviso sin carga a cada navegador de la cuenta, con TTL corto y urgencia alta', async () => {
      await subscribe(USER_ID, 'movil');
      await subscribe(USER_ID, 'tableta');
      await subscribe(OTHER_USER_ID, 'ajeno');
      const service = fakePushService({});

      const outcome = await deliverRestNotice(db, pushEnv(), notice, {
        now: atEnd,
        fetchImpl: service.fetchImpl,
      });

      expect(outcome).toStrictEqual({ kind: 'sent', delivered: 2, gone: 0, failed: 0 });
      expect(service.received.map((push) => push.url).sort()).toStrictEqual([
        'https://web.push.apple.com/movil',
        'https://web.push.apple.com/tableta',
      ]);
      for (const push of service.received) {
        expect(push.headers.get('ttl')).toBe(String(REST_NOTICE_TTL_SECONDS));
        expect(push.headers.get('urgency')).toBe('high');
        expect(push.headers.get('content-length')).toBe('0');
        expect(push.headers.get('authorization')).toMatch(/^vapid t=.+, k=B/);
      }
    });

    it('retira las suscripciones muertas (404 y 410) y sigue con las demás aunque una falle', async () => {
      await subscribe(USER_ID, 'viva');
      await subscribe(USER_ID, 'caducada');
      await subscribe(USER_ID, 'borrada');
      await subscribe(USER_ID, 'caida');
      await subscribe(USER_ID, 'sin-red');
      const service = fakePushService({
        'https://web.push.apple.com/caducada': 410,
        'https://web.push.apple.com/borrada': 404,
        'https://web.push.apple.com/caida': 503,
        'https://web.push.apple.com/sin-red': 'throw',
      });

      const outcome = await deliverRestNotice(db, pushEnv(), notice, {
        now: atEnd,
        fetchImpl: service.fetchImpl,
      });

      expect(outcome).toStrictEqual({ kind: 'sent', delivered: 1, gone: 2, failed: 2 });
      const left = await db
        .select({ endpoint: pushSubscription.endpoint })
        .from(pushSubscription)
        .where(eq(pushSubscription.userId, USER_ID));
      expect(left.map((row) => row.endpoint).sort()).toStrictEqual([
        'https://web.push.apple.com/caida',
        'https://web.push.apple.com/sin-red',
        'https://web.push.apple.com/viva',
      ]);
    });

    it('no manda nada sin claves, tarde, con la sesión cerrada o sin suscripciones', async () => {
      const service = fakePushService({});
      const deliver = (
        overrides: Partial<ScheduledRestNotice>,
        now: Date,
        secrets: Partial<Record<SecretName, string>> = {},
      ) =>
        deliverRestNotice(
          db,
          pushEnv(secrets),
          { ...notice, ...overrides },
          {
            now,
            fetchImpl: service.fetchImpl,
          },
        );

      expect(await deliver({}, atEnd)).toStrictEqual({
        kind: 'skipped',
        reason: 'no_subscriptions',
      });

      await subscribe(USER_ID, 'movil');
      expect(await deliver({}, atEnd, { VAPID_PRIVATE_KEY: '' })).toStrictEqual({
        kind: 'skipped',
        reason: 'no_keys',
      });
      const tooLate = new Date(atEnd.getTime() + (REST_NOTICE_TTL_SECONDS + 1) * 1000);
      expect(await deliver({}, tooLate)).toStrictEqual({ kind: 'skipped', reason: 'late' });
      expect(await deliver({ sessionId: CLOSED_SESSION_ID }, atEnd)).toStrictEqual({
        kind: 'skipped',
        reason: 'session_not_open',
      });
      expect(await deliver({ sessionId: OTHER_SESSION_ID }, atEnd)).toStrictEqual({
        kind: 'skipped',
        reason: 'session_not_open',
      });
      expect(service.received).toHaveLength(0);
    });

    it('una clave privada mal copiada cuenta como fallo, no lanza', async () => {
      await subscribe(USER_ID, 'movil');
      const service = fakePushService({});

      const outcome = await deliverRestNotice(db, pushEnv({ VAPID_PRIVATE_KEY: 'corta' }), notice, {
        now: atEnd,
        fetchImpl: service.fetchImpl,
      });

      expect(outcome).toStrictEqual({ kind: 'sent', delivered: 0, gone: 0, failed: 1 });
      expect(service.received).toHaveLength(0);
    });
  });

  describe('PUT /push/rest-notice', () => {
    it('programa la alarma de la cuenta al fin del descanso y repetirlo la reprograma', async () => {
      const token = await tokenFor(USER_ID);
      const first = secondsFromNow(90);
      const second = secondsFromNow(120);

      expect((await send('PUT', token, { sessionId: OPEN_SESSION_ID, endsAt: first })).status).toBe(
        204,
      );
      expect(await scheduledAlarmAt(USER_ID)).toBe(Date.parse(first));

      await send('PUT', token, { sessionId: OPEN_SESSION_ID, endsAt: second });
      expect(await scheduledAlarmAt(USER_ID)).toBe(Date.parse(second));
      expect(await alarmOf(USER_ID).pending()).toStrictEqual({
        userId: USER_ID,
        sessionId: OPEN_SESSION_ID,
        endsAt: second,
      });
      expect(await scheduledAlarmAt(OTHER_USER_ID)).toBeNull();
    });

    it('guarda el fin en UTC aunque llegue con desfase horario', async () => {
      const endsAtUtc = new Date(Math.floor((Date.now() + 90_000) / 1000) * 1000);
      const withOffset = new Date(endsAtUtc.getTime() + 2 * 3600_000)
        .toISOString()
        .replace('Z', '+02:00');

      await send('PUT', await tokenFor(USER_ID), {
        sessionId: OPEN_SESSION_ID,
        endsAt: withOffset,
      });

      expect((await alarmOf(USER_ID).pending())?.endsAt).toBe(endsAtUtc.toISOString());
    });

    it('un descanso que ya acabó quita el aviso pendiente', async () => {
      const token = await tokenFor(USER_ID);
      await send('PUT', token, { sessionId: OPEN_SESSION_ID, endsAt: secondsFromNow(90) });

      const response = await send('PUT', token, {
        sessionId: OPEN_SESSION_ID,
        endsAt: secondsFromNow(-5),
      });

      expect(response.status).toBe(204);
      expect(await scheduledAlarmAt(USER_ID)).toBeNull();
      expect(await alarmOf(USER_ID).pending()).toBeNull();
    });

    it('sin claves en el servidor no programa nada', async () => {
      const response = await send(
        'PUT',
        await tokenFor(USER_ID),
        { sessionId: OPEN_SESSION_ID, endsAt: secondsFromNow(90) },
        { VAPID_PUBLIC_KEY: '' },
      );

      expect(response.status).toBe(204);
      expect(await scheduledAlarmAt(USER_ID)).toBeNull();
    });

    it('rechaza un fin demasiado lejano, una sesión cerrada y una ajena', async () => {
      const token = await tokenFor(USER_ID);

      const far = await send('PUT', token, {
        sessionId: OPEN_SESSION_ID,
        endsAt: secondsFromNow(MAX_REST_NOTICE_DELAY_SECONDS + 60),
      });
      expect(far.status).toBe(400);
      expect(apiErrorSchema.parse(await far.json()).error.code).toBe('validation_failed');

      const closed = await send('PUT', token, {
        sessionId: CLOSED_SESSION_ID,
        endsAt: secondsFromNow(90),
      });
      expect(closed.status).toBe(409);
      expect(apiErrorSchema.parse(await closed.json()).error.code).toBe('session_closed');

      const foreign = await send('PUT', token, {
        sessionId: OTHER_SESSION_ID,
        endsAt: secondsFromNow(90),
      });
      expect(foreign.status).toBe(404);

      const malformed = await send('PUT', token, { sessionId: OPEN_SESSION_ID });
      expect(malformed.status).toBe(400);

      expect(await scheduledAlarmAt(USER_ID)).toBeNull();
    });

    it('exige sesión', async () => {
      const response = await send('PUT', null, {
        sessionId: OPEN_SESSION_ID,
        endsAt: secondsFromNow(90),
      });

      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /push/rest-notice', () => {
    it('quita el aviso pendiente y repetirlo responde igual', async () => {
      const token = await tokenFor(USER_ID);
      await send('PUT', token, { sessionId: OPEN_SESSION_ID, endsAt: secondsFromNow(90) });

      expect((await send('DELETE', token)).status).toBe(204);
      expect(await scheduledAlarmAt(USER_ID)).toBeNull();
      expect((await send('DELETE', token)).status).toBe(204);
    });

    it('exige sesión', async () => {
      expect((await send('DELETE', null)).status).toBe(401);
    });
  });

  describe('la alarma', () => {
    it('al sonar manda el aviso y se olvida de él', async () => {
      await subscribe(USER_ID, 'movil');
      const service = fakePushService({});
      vi.stubGlobal('fetch', service.fetchImpl);
      // El fin queda por delante para que la alarma no suene sola antes de forzarla; las claves
      // del `env` del Durable Object las pone vitest.config.ts.
      await alarmOf(USER_ID).schedule({
        userId: USER_ID,
        sessionId: OPEN_SESSION_ID,
        endsAt: secondsFromNow(60),
      });

      expect(await runDurableObjectAlarm(alarmOf(USER_ID))).toBe(true);

      expect(service.received.map((push) => push.url)).toStrictEqual([
        'https://web.push.apple.com/movil',
      ]);
      expect(await alarmOf(USER_ID).pending()).toBeNull();
    });

    it('sin aviso guardado no manda nada', async () => {
      await subscribe(USER_ID, 'movil');
      const service = fakePushService({});
      vi.stubGlobal('fetch', service.fetchImpl);
      await runInDurableObject(alarmOf(USER_ID), (_instance, state) =>
        state.storage.setAlarm(Date.now()),
      );

      await runDurableObjectAlarm(alarmOf(USER_ID));

      expect(service.received).toHaveLength(0);
    });
  });
});
