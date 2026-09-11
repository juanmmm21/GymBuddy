import {
  apiErrorSchema,
  formatInvitationCode,
  invitationSchema,
  loginOptionsResponseSchema,
  registrationOptionsResponseSchema,
  sessionSchema,
  userSchema,
  type LoginOptionsResponse,
  type RegistrationOptionsResponse,
  type Session,
} from '@gymbuddy/shared';
import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { issueInvitation } from '../src/auth/invitations';
import { finishPasskeyLogin, finishPasskeyRegistration } from '../src/auth/passkeys';
import { readRelyingParty } from '../src/auth/relying-party';
import { createDatabase, type Database } from '../src/db/client';
import { authChallenge, invitation, passkeyCredential, user } from '../src/db/schema';
import { app } from '../src/index';
import {
  createPasskey,
  generateKeyPair,
  signInWithPasskey,
  toBase64Url,
  type VirtualPasskey,
} from './virtual-authenticator';
import { envWithSecrets } from './worker-env';

const BASE = 'https://gymbuddy.test/api/v1';
const JWT_SECRET = 'un-secreto-de-sesion-para-las-pruebas';
const ADMIN_TOKEN = 'un-token-de-administracion-para-las-pruebas';
const DAY_MS = 24 * 60 * 60 * 1000;

const authEnv = (overrides: { JWT_SECRET?: string } = {}): Env =>
  envWithSecrets({ JWT_SECRET, ADMIN_TOKEN, ...overrides });

const post = (body?: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

async function errorCode(response: Response): Promise<string> {
  return apiErrorSchema.parse(await response.json()).error.code;
}

async function newInvitationCode(db: Database, now = new Date()): Promise<string> {
  return (await issueInvitation(db, { createdByUserId: null, now })).code;
}

async function requestRegistrationOptions(code: string, env = authEnv()): Promise<Response> {
  return await app.request(
    `${BASE}/auth/registration/options`,
    post({ invitationCode: code, displayName: 'Juan', locale: 'es' }),
    env,
  );
}

async function registrationOptions(code: string): Promise<RegistrationOptionsResponse> {
  const response = await requestRegistrationOptions(code);
  expect(response.status).toBe(200);

  return registrationOptionsResponseSchema.parse(await response.json());
}

async function loginOptions(): Promise<LoginOptionsResponse> {
  const response = await app.request(`${BASE}/auth/login/options`, post(), authEnv());
  expect(response.status).toBe(200);

  return loginOptionsResponseSchema.parse(await response.json());
}

async function verifyRegistration(body: unknown, env = authEnv()): Promise<Response> {
  return await app.request(`${BASE}/auth/registration/verify`, post(body), env);
}

async function verifyLogin(body: unknown): Promise<Response> {
  return await app.request(`${BASE}/auth/login/verify`, post(body), authEnv());
}

interface Registered {
  readonly passkey: VirtualPasskey;
  readonly session: Session;
}

/** Registro completo por las rutas: invitación, opciones, passkey creada y cuenta. */
async function register(db: Database): Promise<Registered> {
  const { challengeId, options } = await registrationOptions(await newInvitationCode(db));
  const { credential, passkey } = await createPasskey(options);

  const response = await verifyRegistration({ challengeId, credential });
  expect(response.status).toBe(201);

  return { passkey, session: sessionSchema.parse(await response.json()) };
}

describe('passkeys', () => {
  let db: Database;

  beforeEach(async () => {
    db = createDatabase(env.DB);
    // Cada rechazo deja su motivo en el log a propósito; aquí solo sería ruido.
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await db.delete(authChallenge);
    await db.delete(invitation);
    await db.delete(user);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('invitaciones de administración', () => {
    it('sin el secreto de administración la ruta no existe', async () => {
      const response = await app.request(`${BASE}/admin/invitations`, post(), authEnv());

      expect(response.status).toBe(404);
    });

    it('crea una invitación de una semana y guarda solo su digest', async () => {
      const before = Date.now();
      const response = await app.request(
        `${BASE}/admin/invitations`,
        post(undefined, { 'x-gymbuddy-admin-token': ADMIN_TOKEN }),
        authEnv(),
      );

      expect(response.status).toBe(201);
      const created = invitationSchema.parse(await response.json());
      expect(Date.parse(created.expiresAt) - before).toBeGreaterThanOrEqual(7 * DAY_MS - 1000);

      const [row] = await db.select().from(invitation);
      expect(row?.codeHash).toMatch(/^[0-9a-f]{64}$/);
      expect(row?.codeHash).not.toContain(created.code);

      // El código recién creado sirve para registrarse.
      expect((await requestRegistrationOptions(created.code)).status).toBe(200);
    });
  });

  describe('registro', () => {
    it('crea la cuenta con su passkey, gasta la invitación y abre sesión', async () => {
      const { session } = await register(db);

      expect(session.user.displayName).toBe('Juan');
      expect(session.user.locale).toBe('es');

      const me = await app.request(
        `${BASE}/auth/me`,
        { headers: { authorization: `Bearer ${session.token}` } },
        authEnv(),
      );
      expect(me.status).toBe(200);
      expect(userSchema.parse(await me.json()).id).toBe(session.user.id);

      const [credential] = await db.select().from(passkeyCredential);
      expect(credential).toMatchObject({
        userId: session.user.id,
        counter: 0,
        backedUp: true,
        transports: ['internal', 'hybrid'],
      });

      const [used] = await db.select().from(invitation);
      expect(used?.usedAt).not.toBeNull();
      expect(used?.usedByUserId).toBe(session.user.id);

      // El reto se retiró al verificar.
      expect(await db.select().from(authChallenge)).toEqual([]);
    });

    it('pide una llave detectable, con verificación del usuario y sin atestación', async () => {
      const { options } = await registrationOptions(await newInvitationCode(db));

      expect(options.rp).toEqual({ name: 'GymBuddy', id: 'localhost' });
      expect(options.user.displayName).toBe('Juan');
      expect(options.authenticatorSelection.residentKey).toBe('required');
      expect(options.authenticatorSelection.userVerification).toBe('required');
      expect(options.attestation).toBe('none');
    });

    it('acepta el código como lo teclea la gente', async () => {
      const code = await newInvitationCode(db);

      const response = await requestRegistrationOptions(formatInvitationCode(code).toLowerCase());

      expect(response.status).toBe(200);
    });

    it('rechaza con el mismo error un código inventado, uno caducado y uno ya usado', async () => {
      const expired = await newInvitationCode(db, new Date(Date.now() - 8 * DAY_MS));

      const used = await newInvitationCode(db);
      const { challengeId, options } = await registrationOptions(used);
      const { credential } = await createPasskey(options);
      expect((await verifyRegistration({ challengeId, credential })).status).toBe(201);

      for (const code of ['ABCDEFGHJKMN', expired, used]) {
        const response = await requestRegistrationOptions(code);

        expect(response.status).toBe(400);
        expect(await errorCode(response)).toBe('invitation_invalid');
      }
    });

    it('valida el cuerpo antes de mirar la invitación', async () => {
      const response = await app.request(
        `${BASE}/auth/registration/options`,
        post({ invitationCode: 'ABCDEFGHJKMN', displayName: '   ', locale: 'es' }),
        authEnv(),
      );

      expect(response.status).toBe(400);
      expect(await errorCode(response)).toBe('validation_failed');
    });

    it('una invitación crea una sola cuenta aunque se empiecen dos registros con ella', async () => {
      const code = await newInvitationCode(db);
      // Pedir las opciones no la gasta: los dos registros arrancan.
      const first = await registrationOptions(code);
      const second = await registrationOptions(code);

      const firstPasskey = await createPasskey(first.options);
      const secondPasskey = await createPasskey(second.options);

      const winner = await verifyRegistration({
        challengeId: first.challengeId,
        credential: firstPasskey.credential,
      });
      const loser = await verifyRegistration({
        challengeId: second.challengeId,
        credential: secondPasskey.credential,
      });

      expect(winner.status).toBe(201);
      expect(loser.status).toBe(400);
      expect(await errorCode(loser)).toBe('invitation_invalid');
      expect(await db.select().from(user)).toHaveLength(1);
    });

    it('rechaza una llave creada desde otro origen o sin verificar al usuario', async () => {
      const code = await newInvitationCode(db);

      for (const tweaks of [{ origin: 'https://gymbuddy-falso.test' }, { userVerified: false }]) {
        const { challengeId, options } = await registrationOptions(code);
        const { credential } = await createPasskey(options, tweaks);

        const response = await verifyRegistration({ challengeId, credential });

        expect(response.status).toBe(400);
        expect(await errorCode(response)).toBe('passkey_invalid');
      }

      // Un registro rechazado no gasta la invitación.
      expect(await db.select().from(user)).toEqual([]);
      expect((await requestRegistrationOptions(code)).status).toBe(200);
    });

    it('el reto se presenta una sola vez', async () => {
      const { challengeId, options } = await registrationOptions(await newInvitationCode(db));
      const { credential } = await createPasskey(options);

      expect((await verifyRegistration({ challengeId, credential })).status).toBe(201);
      const replay = await verifyRegistration({ challengeId, credential });

      expect(replay.status).toBe(400);
      expect(await errorCode(replay)).toBe('passkey_invalid');
    });

    it('un reto caducado no sirve', async () => {
      const { challengeId, options } = await registrationOptions(await newInvitationCode(db));
      const { credential } = await createPasskey(options);
      const later = new Date(Date.now() + 6 * 60 * 1000);

      await expect(
        finishPasskeyRegistration(db, readRelyingParty(env), { challengeId, credential }, later),
      ).rejects.toMatchObject({ code: 'passkey_invalid' });
    });

    it('sin secreto de firma responde 500 y no gasta la invitación', async () => {
      const code = await newInvitationCode(db);
      const { challengeId, options } = await registrationOptions(code);
      const { credential } = await createPasskey(options);

      const response = await verifyRegistration(
        { challengeId, credential },
        authEnv({ JWT_SECRET: '' }),
      );

      expect(response.status).toBe(500);
      expect((await requestRegistrationOptions(code)).status).toBe(200);
    });
  });

  describe('entrada', () => {
    it('entra con la passkey registrada y apunta su uso', async () => {
      const { passkey, session } = await register(db);
      const { challengeId, options } = await loginOptions();

      const response = await verifyLogin({
        challengeId,
        credential: await signInWithPasskey(options, passkey),
      });

      expect(response.status).toBe(200);
      expect(sessionSchema.parse(await response.json()).user.id).toBe(session.user.id);

      const [credential] = await db.select().from(passkeyCredential);
      expect(credential?.lastUsedAt).not.toBeNull();
    });

    it('no pide usuario y exige verificarlo', async () => {
      const { options } = await loginOptions();

      expect(options.allowCredentials).toEqual([]);
      expect(options.rpId).toBe('localhost');
      expect(options.userVerification).toBe('required');
    });

    it('rechaza una llave que no es de ninguna cuenta', async () => {
      const { passkey } = await register(db);
      const { challengeId, options } = await loginOptions();
      const stranger: VirtualPasskey = {
        ...passkey,
        credentialId: toBase64Url(crypto.getRandomValues(new Uint8Array(16))),
      };

      const response = await verifyLogin({
        challengeId,
        credential: await signInWithPasskey(options, stranger),
      });

      expect(response.status).toBe(400);
      expect(await errorCode(response)).toBe('passkey_invalid');
    });

    it('rechaza una firma hecha con otra clave, otro usuario o sin verificar al usuario', async () => {
      const { passkey } = await register(db);
      const otherKey = await generateKeyPair();
      const otherUserHandle = toBase64Url(new TextEncoder().encode(crypto.randomUUID()));

      for (const tweaks of [
        { signingKey: otherKey.privateKey },
        { userHandle: otherUserHandle },
        { userVerified: false },
        { origin: 'https://gymbuddy-falso.test' },
      ]) {
        const { challengeId, options } = await loginOptions();
        const response = await verifyLogin({
          challengeId,
          credential: await signInWithPasskey(options, passkey, tweaks),
        });

        expect(response.status).toBe(400);
        expect(await errorCode(response)).toBe('passkey_invalid');
      }
    });

    it('rechaza un contador que retrocede, que delata una llave clonada', async () => {
      const { passkey } = await register(db);

      const first = await loginOptions();
      const advanced = await verifyLogin({
        challengeId: first.challengeId,
        credential: await signInWithPasskey(first.options, passkey, { counter: 5 }),
      });
      expect(advanced.status).toBe(200);

      const second = await loginOptions();
      const cloned = await verifyLogin({
        challengeId: second.challengeId,
        credential: await signInWithPasskey(second.options, passkey, { counter: 3 }),
      });

      expect(cloned.status).toBe(400);
      const [credential] = await db
        .select()
        .from(passkeyCredential)
        .where(eq(passkeyCredential.id, passkey.credentialId));
      expect(credential?.counter).toBe(5);
    });

    it('la misma respuesta firmada no se puede presentar dos veces', async () => {
      const { passkey } = await register(db);
      const { challengeId, options } = await loginOptions();
      const body = { challengeId, credential: await signInWithPasskey(options, passkey) };

      expect((await verifyLogin(body)).status).toBe(200);
      const replay = await verifyLogin(body);

      expect(replay.status).toBe(400);
      expect(await errorCode(replay)).toBe('passkey_invalid');
    });

    it('un reto de registro no sirve para entrar', async () => {
      const { passkey } = await register(db);
      const registration = await registrationOptions(await newInvitationCode(db));
      const { options } = await loginOptions();

      const response = await verifyLogin({
        challengeId: registration.challengeId,
        credential: await signInWithPasskey(options, passkey, {
          challenge: registration.options.challenge,
        }),
      });

      expect(response.status).toBe(400);
      expect(await errorCode(response)).toBe('passkey_invalid');
    });

    it('un reto de entrada caducado no sirve', async () => {
      const { passkey } = await register(db);
      const { challengeId, options } = await loginOptions();
      const credential = await signInWithPasskey(options, passkey);
      const later = new Date(Date.now() + 6 * 60 * 1000);

      await expect(
        finishPasskeyLogin(db, readRelyingParty(env), { challengeId, credential }, later),
      ).rejects.toMatchObject({ code: 'passkey_invalid' });
    });
  });
});
