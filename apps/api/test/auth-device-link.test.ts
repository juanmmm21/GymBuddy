import {
  apiErrorSchema,
  deviceLinkSchema,
  formatAccessCode,
  loginOptionsResponseSchema,
  registrationOptionsResponseSchema,
  sessionSchema,
  type DeviceLink,
  type RegistrationOptionsResponse,
  type Session,
} from '@gymbuddy/shared';
import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEVICE_LINK_TTL_MS, purgeExpiredDeviceLinks } from '../src/auth/device-links';
import { issueInvitation } from '../src/auth/invitations';
import { createDatabase, type Database } from '../src/db/client';
import { authChallenge, deviceLink, invitation, passkeyCredential, user } from '../src/db/schema';
import { app } from '../src/index';
import { createPasskey, signInWithPasskey, type VirtualPasskey } from './virtual-authenticator';
import { envWithSecrets } from './worker-env';

const BASE = 'https://gymbuddy.test/api/v1';
const JWT_SECRET = 'un-secreto-de-sesion-para-las-pruebas';

const authEnv = (): Env => envWithSecrets({ JWT_SECRET });

const post = (body?: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

const bearer = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` });

async function errorCode(response: Response): Promise<string> {
  return apiErrorSchema.parse(await response.json()).error.code;
}

interface Account {
  readonly session: Session;
  readonly passkey: VirtualPasskey;
}

/** Una cuenta con su primera passkey, por las rutas de siempre. */
async function register(db: Database): Promise<Account> {
  const { code } = await issueInvitation(db, { createdByUserId: null, now: new Date() });
  const options = registrationOptionsResponseSchema.parse(
    await (
      await app.request(
        `${BASE}/auth/registration/options`,
        post({ invitationCode: code, displayName: 'Juan', locale: 'es' }),
        authEnv(),
      )
    ).json(),
  );
  const { credential, passkey } = await createPasskey(options.options);
  const response = await app.request(
    `${BASE}/auth/registration/verify`,
    post({ challengeId: options.challengeId, credential }),
    authEnv(),
  );
  expect(response.status).toBe(201);

  return { session: sessionSchema.parse(await response.json()), passkey };
}

async function requestDeviceLink(token: string): Promise<Response> {
  return await app.request(`${BASE}/auth/devices/link`, post(undefined, bearer(token)), authEnv());
}

async function newDeviceLink(token: string): Promise<DeviceLink> {
  const response = await requestDeviceLink(token);
  expect(response.status).toBe(201);

  return deviceLinkSchema.parse(await response.json());
}

async function requestLinkOptions(linkCode: string): Promise<Response> {
  return await app.request(`${BASE}/auth/devices/options`, post({ linkCode }), authEnv());
}

async function linkOptions(linkCode: string): Promise<RegistrationOptionsResponse> {
  const response = await requestLinkOptions(linkCode);
  expect(response.status).toBe(200);

  return registrationOptionsResponseSchema.parse(await response.json());
}

async function verifyLink(body: unknown): Promise<Response> {
  return await app.request(`${BASE}/auth/devices/verify`, post(body), authEnv());
}

/** El baile entero desde el dispositivo nuevo: código, opciones, llave y sesión. */
async function linkDevice(code: string): Promise<{ response: Response; passkey: VirtualPasskey }> {
  const { challengeId, options } = await linkOptions(code);
  const { credential, passkey } = await createPasskey(options);

  return { response: await verifyLink({ challengeId, credential }), passkey };
}

describe('añadir otro dispositivo', () => {
  let db: Database;

  beforeEach(async () => {
    db = createDatabase(env.DB);
    // Cada rechazo deja su motivo en el log a propósito; aquí solo sería ruido.
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await db.delete(authChallenge);
    await db.delete(deviceLink);
    await db.delete(invitation);
    await db.delete(user);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('el código', () => {
    it('lo pide quien tiene sesión y solo queda su digest', async () => {
      const { session } = await register(db);

      const link = await newDeviceLink(session.token);

      expect(link.code).toMatch(/^[0-9A-Z]{8}$/);
      const [row] = await db.select().from(deviceLink);
      expect(row?.userId).toBe(session.user.id);
      expect(row?.codeHash).not.toBe(link.code);
      expect(row?.usedAt).toBeNull();
      expect(Date.parse(link.expiresAt) - Date.parse(row?.createdAt ?? '')).toBe(
        DEVICE_LINK_TTL_MS,
      );
    });

    it('sin sesión no se puede pedir', async () => {
      const response = await app.request(`${BASE}/auth/devices/link`, post(), authEnv());

      expect(response.status).toBe(401);
      expect(await errorCode(response)).toBe('unauthorized');
    });

    it('pedir otro retira el anterior: una cuenta no acumula códigos', async () => {
      const { session } = await register(db);
      const first = await newDeviceLink(session.token);

      const second = await newDeviceLink(session.token);

      expect(await db.select().from(deviceLink)).toHaveLength(1);
      expect((await requestLinkOptions(first.code)).status).toBe(400);
      expect((await requestLinkOptions(second.code)).status).toBe(200);
    });

    it('se acepta tecleado como se lee en la otra pantalla', async () => {
      const { session } = await register(db);
      const { code } = await newDeviceLink(session.token);

      const response = await requestLinkOptions(formatAccessCode(code).toLowerCase());

      expect(response.status).toBe(200);
    });

    it('un código inventado, uno caducado y uno ya usado fallan igual', async () => {
      const { session } = await register(db);
      const expired = await newDeviceLink(session.token);
      await db
        .update(deviceLink)
        .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
        .where(eq(deviceLink.userId, session.user.id));

      const used = await newDeviceLink(session.token);
      expect((await linkDevice(used.code)).response.status).toBe(201);

      for (const code of ['ABCDEFGH', expired.code, used.code]) {
        const response = await requestLinkOptions(code);

        expect(response.status).toBe(400);
        expect(await errorCode(response)).toBe('device_link_invalid');
      }
    });

    it('el Cron retira los caducados, usados o no', async () => {
      const { session } = await register(db);
      await newDeviceLink(session.token);
      await db.update(deviceLink).set({ expiresAt: new Date(Date.now() - 1000).toISOString() });

      expect(await purgeExpiredDeviceLinks(db, new Date())).toBe(1);
      expect(await db.select().from(deviceLink)).toEqual([]);
    });
  });

  describe('la passkey del dispositivo nuevo', () => {
    it('se cuelga de la cuenta que ya existía y abre sesión allí', async () => {
      const { session } = await register(db);
      const { code } = await newDeviceLink(session.token);

      const { response, passkey } = await linkDevice(code);

      expect(response.status).toBe(201);
      const linked = sessionSchema.parse(await response.json());
      expect(linked.user.id).toBe(session.user.id);
      expect(linked.user.displayName).toBe('Juan');
      expect(await db.select().from(user)).toHaveLength(1);

      const credentials = await db
        .select()
        .from(passkeyCredential)
        .where(eq(passkeyCredential.userId, session.user.id));
      expect(credentials).toHaveLength(2);
      expect(credentials.map((row) => row.id)).toContain(passkey.credentialId);
    });

    it('la llave nueva entra por la pantalla de entrada, como la primera', async () => {
      const { session } = await register(db);
      const { passkey } = await linkDevice((await newDeviceLink(session.token)).code);

      const started = await app.request(`${BASE}/auth/login/options`, post(), authEnv());
      const { challengeId, options } = loginOptionsResponseSchema.parse(await started.json());
      const credential = await signInWithPasskey(options, passkey);
      const response = await app.request(
        `${BASE}/auth/login/verify`,
        post({ challengeId, credential }),
        authEnv(),
      );

      expect(response.status).toBe(200);
      expect(sessionSchema.parse(await response.json()).user.id).toBe(session.user.id);
    });

    it('las llaves que la cuenta ya tiene se excluyen de la ceremonia', async () => {
      const { session, passkey } = await register(db);
      const { code } = await newDeviceLink(session.token);

      const { options } = await linkOptions(code);

      expect(options.excludeCredentials.map((credential) => credential.id)).toEqual([
        passkey.credentialId,
      ]);
      // El identificador de la cuenta es el de siempre: el móvil tiene que devolverlo al entrar.
      expect(options.user.name).toBe('Juan');
    });

    it('el código se gasta una sola vez', async () => {
      const { session } = await register(db);
      const { code } = await newDeviceLink(session.token);
      const first = await linkOptions(code);
      const second = await linkOptions(code);

      const winner = await verifyLink({
        challengeId: first.challengeId,
        credential: (await createPasskey(first.options)).credential,
      });
      const loser = await verifyLink({
        challengeId: second.challengeId,
        credential: (await createPasskey(second.options)).credential,
      });

      expect(winner.status).toBe(201);
      expect(loser.status).toBe(400);
      expect(await errorCode(loser)).toBe('device_link_invalid');
      expect(await db.select().from(passkeyCredential)).toHaveLength(2);
    });

    it('una llave creada desde otro origen o sin verificar no se guarda ni gasta el código', async () => {
      const { session } = await register(db);
      const { code } = await newDeviceLink(session.token);

      for (const tweaks of [{ origin: 'https://gymbuddy-falso.test' }, { userVerified: false }]) {
        const { challengeId, options } = await linkOptions(code);
        const { credential } = await createPasskey(options, tweaks);

        const response = await verifyLink({ challengeId, credential });

        expect(response.status).toBe(400);
        expect(await errorCode(response)).toBe('passkey_invalid');
      }

      expect(await db.select().from(passkeyCredential)).toHaveLength(1);
      expect((await requestLinkOptions(code)).status).toBe(200);
    });

    it('el reto se presenta una sola vez', async () => {
      const { session } = await register(db);
      const { challengeId, options } = await linkOptions((await newDeviceLink(session.token)).code);
      const { credential } = await createPasskey(options);

      expect((await verifyLink({ challengeId, credential })).status).toBe(201);
      const replay = await verifyLink({ challengeId, credential });

      expect(replay.status).toBe(400);
      expect(await errorCode(replay)).toBe('passkey_invalid');
    });

    it('el reto de un registro no vale para añadir un dispositivo', async () => {
      const { session } = await register(db);
      const { code } = await newDeviceLink(session.token);
      const { challengeId, options } = await linkOptions(code);
      const { credential } = await createPasskey(options);

      const response = await app.request(
        `${BASE}/auth/registration/verify`,
        post({ challengeId, credential }),
        authEnv(),
      );

      expect(response.status).toBe(400);
      expect(await errorCode(response)).toBe('passkey_invalid');
    });

    it('presentar la llave que el dispositivo ya tenía no la duplica', async () => {
      const { session, passkey } = await register(db);
      const { code } = await newDeviceLink(session.token);
      const { challengeId, options } = await linkOptions(code);
      // El mismo identificador de credencial: es lo que mandaría el móvil que ya tiene esa llave.
      const again = await createPasskey(options, { credentialId: passkey.credentialId });

      const response = await verifyLink({ challengeId, credential: again.credential });

      expect(response.status).toBe(400);
      expect(await errorCode(response)).toBe('passkey_invalid');
      expect(await db.select().from(passkeyCredential)).toHaveLength(1);
      // No había nada que guardar, así que el código sigue sirviendo para el móvil de verdad.
      expect((await requestLinkOptions(code)).status).toBe(200);
    });

    it('valida el cuerpo antes de mirar el código', async () => {
      const response = await requestLinkOptions('NO-ES-UN-CODIGO-LARGO');

      expect(response.status).toBe(400);
      expect(await errorCode(response)).toBe('validation_failed');
    });
  });
});
