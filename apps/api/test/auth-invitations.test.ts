import { INVITATION_CODE_LENGTH, isAccessCode } from '@gymbuddy/shared';
import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CHALLENGE_TTL_MS,
  purgeExpiredChallenges,
  storeChallenge,
  takeAuthenticationChallenge,
} from '../src/auth/challenges';
import {
  consumeInvitation,
  generateInvitationCode,
  hashInvitationCode,
  INVITATION_LIMIT,
  INVITATION_LIMIT_WINDOW_DAYS,
  INVITATION_TTL_MS,
  issueInvitation,
  issueInvitationFor,
  readInvitationQuota,
  readInvitationStatus,
  releaseInvitation,
} from '../src/auth/invitations';
import { readRelyingParty } from '../src/auth/relying-party';
import { createDatabase, type Database } from '../src/db/client';
import { authChallenge, invitation, user } from '../src/db/schema';

describe('códigos de invitación', () => {
  it('genera códigos canónicos y distintos', () => {
    const codes = Array.from({ length: 50 }, () => generateInvitationCode());

    expect(codes.every((code) => isAccessCode(code, INVITATION_CODE_LENGTH))).toBe(true);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('ciclo de una invitación', () => {
  let db: Database;
  const now = new Date('2026-09-11T10:00:00.000Z');

  beforeEach(async () => {
    db = createDatabase(env.DB);
    await db.delete(authChallenge);
    await db.delete(invitation);
    await db.delete(user);
  });

  it('se consume una sola vez', async () => {
    const { code } = await issueInvitation(db, { createdByUserId: null, now });
    const codeHash = await hashInvitationCode(code);

    expect(await consumeInvitation(db, codeHash, now)).toBe(true);
    expect(await consumeInvitation(db, codeHash, now)).toBe(false);
  });

  it('una caducada no se consume', async () => {
    const { code, expiresAt } = await issueInvitation(db, { createdByUserId: null, now });

    const consumed = await consumeInvitation(
      db,
      await hashInvitationCode(code),
      new Date(expiresAt),
    );

    expect(consumed).toBe(false);
  });

  it('se devuelve la que gastó un registro sin cuenta, pero no la que ya tiene dueño', async () => {
    const { code } = await issueInvitation(db, { createdByUserId: null, now });
    const codeHash = await hashInvitationCode(code);

    await consumeInvitation(db, codeHash, now);
    await releaseInvitation(db, codeHash, now.toISOString());
    expect(await consumeInvitation(db, codeHash, now)).toBe(true);

    const ownerId = crypto.randomUUID();
    await db
      .insert(user)
      .values({ id: ownerId, displayName: 'Juan', createdAt: now.toISOString() });
    await db
      .update(invitation)
      .set({ usedByUserId: ownerId })
      .where(eq(invitation.codeHash, codeHash));

    await releaseInvitation(db, codeHash, now.toISOString());
    expect(await consumeInvitation(db, codeHash, now)).toBe(false);
  });
});

describe('invitaciones pedidas desde la app', () => {
  let db: Database;
  const now = new Date('2026-09-12T10:00:00.000Z');
  const inviterId = '0d1e2f30-4a5b-4c6d-8e9f-0a1b2c3d4e5f';
  const otherId = '1e2f3041-5b6c-4d7e-9f01-1b2c3d4e5f60';

  beforeEach(async () => {
    db = createDatabase(env.DB);
    await db.delete(authChallenge);
    await db.delete(invitation);
    await db.delete(user);
    await db.insert(user).values([
      { id: inviterId, displayName: 'Juan', createdAt: now.toISOString() },
      { id: otherId, displayName: 'Otro', createdAt: now.toISOString() },
    ]);
  });

  const issueFor = (userId: string) => issueInvitation(db, { createdByUserId: userId, now });
  // Las pruebas de la lista miran solo `pending`: con la cuenta de administración el cupo es nulo
  // y no se mezcla. El cupo tiene sus propias pruebas abajo.
  const inviter = { id: inviterId, isAdmin: true };
  const nothingPending = { pending: [], quota: null };

  it('lista las que ese usuario tiene sin usar, de la que antes caduca a la que después', async () => {
    expect(await readInvitationStatus(db, inviter, now)).toEqual(nothingPending);

    const later = new Date(now.getTime() + 60_000);
    await issueInvitation(db, { createdByUserId: inviterId, now: later });
    await issueFor(inviterId);
    const { pending } = await readInvitationStatus(db, inviter, later);

    expect(pending.map(({ createdAt }) => createdAt)).toEqual([
      now.toISOString(),
      later.toISOString(),
    ]);
  });

  it('la creación directa (la de administración) no mira ningún cupo', async () => {
    for (let index = 0; index < 12; index += 1) {
      await issueFor(inviterId);
    }

    expect((await readInvitationStatus(db, inviter, now)).pending).toHaveLength(12);
  });

  it('una usada o caducada deja de contar como pendiente', async () => {
    const { code } = await issueFor(inviterId);
    await issueFor(inviterId);

    await consumeInvitation(db, await hashInvitationCode(code), now);
    expect((await readInvitationStatus(db, inviter, now)).pending).toHaveLength(1);

    const afterExpiry = new Date(now.getTime() + INVITATION_TTL_MS);
    expect(await readInvitationStatus(db, inviter, afterExpiry)).toEqual(nothingPending);
  });

  it('no enseña las de otra cuenta ni las de administración', async () => {
    await issueFor(otherId);
    await issueInvitation(db, { createdByUserId: null, now });

    expect(await readInvitationStatus(db, inviter, now)).toEqual(nothingPending);
  });

  it('una cuenta normal ve su cupo y cuándo se renueva al agotarlo', async () => {
    const normal = { id: inviterId, isAdmin: false };
    const day = 24 * 60 * 60 * 1000;

    for (let index = 0; index < INVITATION_LIMIT; index += 1) {
      await issueInvitationFor(db, normal, new Date(now.getTime() + index * day));
    }
    const lastDay = new Date(now.getTime() + (INVITATION_LIMIT - 1) * day);

    expect((await readInvitationStatus(db, normal, lastDay)).quota).toEqual({
      limit: INVITATION_LIMIT,
      windowDays: INVITATION_LIMIT_WINDOW_DAYS,
      remaining: 0,
      // Se libera hueco cuando la más antigua sale de la ventana.
      renewsAt: new Date(now.getTime() + INVITATION_LIMIT_WINDOW_DAYS * day).toISOString(),
    });
    await expect(issueInvitationFor(db, normal, lastDay)).rejects.toMatchObject({
      code: 'invitation_limit_reached',
    });

    const renewed = new Date(now.getTime() + INVITATION_LIMIT_WINDOW_DAYS * day + 1);
    expect((await readInvitationStatus(db, normal, renewed)).quota).toMatchObject({
      remaining: 1,
      renewsAt: null,
    });
    await issueInvitationFor(db, normal, renewed);
  });

  it('el cupo es de cada cuenta', async () => {
    for (let index = 0; index < INVITATION_LIMIT; index += 1) {
      await issueInvitationFor(db, { id: otherId, isAdmin: false }, now);
    }

    const quota = await readInvitationQuota(db, inviterId, now);
    expect(quota.remaining).toBe(INVITATION_LIMIT);
  });
});

describe('retos', () => {
  let db: Database;
  const now = new Date('2026-09-11T10:00:00.000Z');

  beforeEach(async () => {
    db = createDatabase(env.DB);
    await db.delete(authChallenge);
  });

  it('se retira al leerlo', async () => {
    const id = await storeChallenge(db, { kind: 'authentication', challenge: 'reto' }, now);

    expect(await takeAuthenticationChallenge(db, id, now)).toBe('reto');
    expect(await takeAuthenticationChallenge(db, id, now)).toBeNull();
  });

  it('el Cron barre los caducados y deja los vivos', async () => {
    const old = new Date(now.getTime() - CHALLENGE_TTL_MS - 1000);
    await storeChallenge(db, { kind: 'authentication', challenge: 'viejo' }, old);
    const fresh = await storeChallenge(db, { kind: 'authentication', challenge: 'nuevo' }, now);

    expect(await purgeExpiredChallenges(db, now)).toBe(1);
    expect(await takeAuthenticationChallenge(db, fresh, now)).toBe('nuevo');
  });
});

describe('configuración de las passkeys', () => {
  it('acepta el origen de la PWA en su dominio o en un subdominio', () => {
    expect(
      readRelyingParty({ WEBAUTHN_RP_ID: 'localhost', WEBAUTHN_ORIGIN: 'http://localhost:5173' }),
    ).toEqual({ id: 'localhost', origin: 'http://localhost:5173', name: 'GymBuddy' });
    expect(
      readRelyingParty({
        WEBAUTHN_RP_ID: 'gymbuddy.example',
        WEBAUTHN_ORIGIN: 'https://app.gymbuddy.example',
      }).id,
    ).toBe('gymbuddy.example');
  });

  it('rechaza un origen de otro dominio, con ruta o que no es una URL', () => {
    const consoleError = console.error;
    console.error = () => undefined;
    try {
      for (const origin of ['https://otro.example', 'http://localhost:5173/', 'no-es-url']) {
        expect(() =>
          readRelyingParty({ WEBAUTHN_RP_ID: 'localhost', WEBAUTHN_ORIGIN: origin }),
        ).toThrow(expect.objectContaining({ code: 'internal_error' }));
      }
    } finally {
      console.error = consoleError;
    }
  });
});
