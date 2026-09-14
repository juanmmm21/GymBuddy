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
import { hashInvitationCode, issueInvitation } from '../src/auth/invitations';
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

  it('da todos los códigos que se pidan y lista los que siguen sin usar', async () => {
    const codes = new Set<string>();
    for (let index = 0; index < 5; index += 1) {
      codes.add((await newInvitation(session.token)).code);
    }

    expect(codes.size).toBe(5);
    expect((await readStatus(session.token)).pending).toHaveLength(5);
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
