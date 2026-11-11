import {
  apiErrorSchema,
  formatAccessCode,
  invitationSchema,
  invitationStatusSchema,
  registrationOptionsResponseSchema,
  sessionSchema,
  type Invitation,
  type InvitationStatus,
  type Session,
} from '@gymbuddy/shared';
import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  hashInvitationCode,
  INVITATION_LIMIT,
  INVITATION_LIMIT_WINDOW_DAYS,
  issueInvitation,
} from '../src/auth/invitations';
import { createDatabase, type Database } from '../src/db/client';
import { authChallenge, invitation, passkeyCredential, user } from '../src/db/schema';
import { app } from '../src/index';
import { createPasskey } from './virtual-authenticator';
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

/** Una cuenta con su passkey, registrada con el código que se le pase. */
async function register(code: string, displayName: string): Promise<Session> {
  const options = registrationOptionsResponseSchema.parse(
    await (
      await app.request(
        `${BASE}/auth/registration/options`,
        post({ invitationCode: code, displayName, locale: 'es' }),
        authEnv(),
      )
    ).json(),
  );
  const { credential } = await createPasskey(options.options);
  const response = await app.request(
    `${BASE}/auth/registration/verify`,
    post({ challengeId: options.challengeId, credential }),
    authEnv(),
  );
  expect(response.status).toBe(201);

  return sessionSchema.parse(await response.json());
}

async function invite(token: string): Promise<Response> {
  return app.request(`${BASE}/auth/invitations`, post(undefined, bearer(token)), authEnv());
}

async function newInvitation(token: string): Promise<Invitation> {
  const response = await invite(token);
  expect(response.status).toBe(201);

  return invitationSchema.parse(await response.json());
}

async function readStatus(token: string): Promise<InvitationStatus> {
  const response = await app.request(
    `${BASE}/auth/invitations`,
    { headers: bearer(token) },
    authEnv(),
  );
  expect(response.status).toBe(200);

  return invitationStatusSchema.parse(await response.json());
}

describe('invitar a un amigo desde la app', () => {
  let db: Database;
  let session: Session;

  beforeEach(async () => {
    db = createDatabase(env.DB);
    await db.delete(authChallenge);
    await db.delete(passkeyCredential);
    await db.delete(invitation);
    await db.delete(user);

    const { code } = await issueInvitation(db, { createdByUserId: null, now: new Date() });
    session = await register(code, 'Juan');
    // La de administración que creó la cuenta no es de nadie: no sale en su lista.
    expect((await readStatus(session.token)).pending).toEqual([]);
  });

  it('el código solo viaja en la respuesta: en la base queda su digest', async () => {
    const created = await newInvitation(session.token);

    const [row] = await db
      .select({
        createdByUserId: invitation.createdByUserId,
        usedAt: invitation.usedAt,
      })
      .from(invitation)
      .where(eq(invitation.codeHash, await hashInvitationCode(created.code)));

    expect(row?.createdByUserId).toBe(session.user.id);
    expect(row?.usedAt).toBeNull();
    const stored = await db.select({ codeHash: invitation.codeHash }).from(invitation);
    expect(stored.some(({ codeHash }) => codeHash === created.code)).toBe(false);
  });

  it('con ese código se registra la cuenta del amigo, aunque lo teclee con guiones', async () => {
    const { code } = await newInvitation(session.token);

    const friend = await register(formatAccessCode(code).toLowerCase(), 'Amiga');

    expect(friend.user.id).not.toBe(session.user.id);
    expect((await readStatus(session.token)).pending).toEqual([]);
  });

  it('una cuenta normal crea hasta su cupo y luego recibe 429 con la fecha de renovación', async () => {
    const codes = new Set<string>();
    for (let index = 0; index < INVITATION_LIMIT; index += 1) {
      codes.add((await newInvitation(session.token)).code);
    }
    expect(codes.size).toBe(INVITATION_LIMIT);

    const refused = await invite(session.token);
    expect(refused.status).toBe(429);
    const body = apiErrorSchema.parse(await refused.json());
    expect(body.error.code).toBe('invitation_limit_reached');
    expect(body.error.detail).toEqual({ renewsAt: expect.any(String) as unknown });

    const status = await readStatus(session.token);
    expect(status.pending).toHaveLength(INVITATION_LIMIT);
    expect(status.quota).toMatchObject({
      limit: INVITATION_LIMIT,
      windowDays: INVITATION_LIMIT_WINDOW_DAYS,
      remaining: 0,
    });
    expect(status.quota?.renewsAt).toBe((body.error.detail as { renewsAt: string }).renewsAt);
  });

  it('las invitaciones ya usadas siguen contando: no se libera hueco gastándolas', async () => {
    for (let index = 0; index < INVITATION_LIMIT; index += 1) {
      const { code } = await newInvitation(session.token);
      await register(code, `Amigo ${String(index)}`);
    }

    expect((await invite(session.token)).status).toBe(429);
  });

  it('peticiones simultáneas no se cuelan por encima del cupo', async () => {
    const responses = await Promise.all(
      Array.from({ length: INVITATION_LIMIT + 4 }, () => invite(session.token)),
    );

    expect(responses.filter((response) => response.status === 201)).toHaveLength(INVITATION_LIMIT);
    expect(responses.filter((response) => response.status === 429)).toHaveLength(4);
  });

  it('las creadas fuera de la ventana no cuentan', async () => {
    const old = new Date(Date.now() - (INVITATION_LIMIT_WINDOW_DAYS + 1) * 24 * 60 * 60 * 1000);
    for (let index = 0; index < INVITATION_LIMIT; index += 1) {
      await issueInvitation(db, { createdByUserId: session.user.id, now: old });
    }

    expect((await readStatus(session.token)).quota?.remaining).toBe(INVITATION_LIMIT);
    await newInvitation(session.token);
  });

  it('la cuenta de administración no tiene cupo', async () => {
    await db.update(user).set({ isAdmin: true }).where(eq(user.id, session.user.id));

    for (let index = 0; index < INVITATION_LIMIT + 2; index += 1) {
      await newInvitation(session.token);
    }

    const status = await readStatus(session.token);
    expect(status.quota).toBeNull();
    expect(status.pending).toHaveLength(INVITATION_LIMIT + 2);
  });

  it('sin sesión no se pide ni se consulta', async () => {
    for (const response of [
      await app.request(`${BASE}/auth/invitations`, post(), authEnv()),
      await app.request(`${BASE}/auth/invitations`, undefined, authEnv()),
    ]) {
      expect(response.status).toBe(401);
      expect(apiErrorSchema.parse(await response.json()).error.code).toBe('unauthorized');
    }
  });
});
