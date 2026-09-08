import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  attachTelegramUser,
  claimLoginNonce,
  generateNonce,
  hashNonce,
  issueLoginNonce,
  purgeExpiredNonces,
} from '../src/auth/nonce';
import { createDatabase, type Database } from '../src/db/client';
import { loginNonce, user } from '../src/db/schema';

const NOW = new Date('2026-09-08T12:00:00.000Z');
const minutesAfter = (minutes: number): Date => new Date(NOW.getTime() + minutes * 60_000);

async function seedUser(db: Database, telegramUserId: number): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(user).values({
    id,
    telegramUserId,
    firstName: 'Juan',
    username: 'juanmmm21',
    photoUrl: null,
    locale: 'es',
    unitSystem: 'metric',
    createdAt: NOW.toISOString(),
  });

  return id;
}

describe('generateNonce', () => {
  it('no repite y cabe en una URL de Telegram sin escapar nada', () => {
    const nonces = Array.from({ length: 50 }, () => generateNonce());

    expect(new Set(nonces).size).toBe(50);
    for (const nonce of nonces) {
      expect(nonce).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(nonce.length).toBeGreaterThanOrEqual(43);
    }
  });
});

describe('ciclo de vida del enlace de entrada', () => {
  let db: Database;

  beforeEach(async () => {
    db = createDatabase(env.DB);
    await db.delete(loginNonce);
    await db.delete(user);
  });

  it('guarda el digest y nunca el nonce en claro', async () => {
    const { nonce } = await issueLoginNonce(db, NOW);

    const [row] = await db.select().from(loginNonce);
    expect(row?.nonceHash).toBe(await hashNonce(nonce));
    expect(row?.nonceHash).not.toBe(nonce);
    expect(row?.userId).toBeNull();
    expect(row?.claimedAt).toBeNull();
  });

  it('está pendiente mientras nadie ha pulsado Start en Telegram', async () => {
    const { nonce } = await issueLoginNonce(db, NOW);

    expect(await claimLoginNonce(db, nonce, minutesAfter(1))).toEqual({ status: 'pending' });
  });

  it('entrega la sesión una vez el bot lo ata a un usuario', async () => {
    const { nonce } = await issueLoginNonce(db, NOW);
    const userId = await seedUser(db, 100_001);

    expect(await attachTelegramUser(db, nonce, userId, minutesAfter(1))).toBe(true);
    expect(await claimLoginNonce(db, nonce, minutesAfter(2))).toEqual({ status: 'ready', userId });
  });

  it('es de un solo uso: el segundo canje ya no vale', async () => {
    const { nonce } = await issueLoginNonce(db, NOW);
    const userId = await seedUser(db, 100_001);
    await attachTelegramUser(db, nonce, userId, minutesAfter(1));

    expect(await claimLoginNonce(db, nonce, minutesAfter(2))).toEqual({ status: 'ready', userId });
    expect(await claimLoginNonce(db, nonce, minutesAfter(3))).toEqual({ status: 'invalid' });
  });

  it('dos canjes a la vez producen una sola sesión', async () => {
    const { nonce } = await issueLoginNonce(db, NOW);
    const userId = await seedUser(db, 100_001);
    await attachTelegramUser(db, nonce, userId, minutesAfter(1));

    const [first, second] = await Promise.all([
      claimLoginNonce(db, nonce, minutesAfter(2)),
      claimLoginNonce(db, nonce, minutesAfter(2)),
    ]);

    // El sellado va en el propio UPDATE condicionado a claimed_at nulo, así que solo uno gana.
    const ready = [first, second].filter((claim) => claim.status === 'ready');
    expect(ready).toHaveLength(1);
  });

  it('caduca a los diez minutos', async () => {
    const { nonce, expiresAt } = await issueLoginNonce(db, NOW);
    const userId = await seedUser(db, 100_001);
    await attachTelegramUser(db, nonce, userId, minutesAfter(1));

    expect(expiresAt).toBe(minutesAfter(10).toISOString());
    expect(await claimLoginNonce(db, nonce, minutesAfter(9))).toEqual({ status: 'ready', userId });
  });

  it('no canjea un enlace caducado', async () => {
    const { nonce } = await issueLoginNonce(db, NOW);
    const userId = await seedUser(db, 100_001);
    await attachTelegramUser(db, nonce, userId, minutesAfter(1));

    expect(await claimLoginNonce(db, nonce, minutesAfter(11))).toEqual({ status: 'invalid' });
  });

  it('no ata un usuario a un enlace ya caducado', async () => {
    const { nonce } = await issueLoginNonce(db, NOW);
    const userId = await seedUser(db, 100_001);

    // Reenviar un mensaje viejo del chat no puede reactivar un enlace muerto.
    expect(await attachTelegramUser(db, nonce, userId, minutesAfter(11))).toBe(false);
  });

  it('no ata un usuario a un enlace ya consumido', async () => {
    const { nonce } = await issueLoginNonce(db, NOW);
    const userId = await seedUser(db, 100_001);
    await attachTelegramUser(db, nonce, userId, minutesAfter(1));
    await claimLoginNonce(db, nonce, minutesAfter(2));

    expect(await attachTelegramUser(db, nonce, userId, minutesAfter(3))).toBe(false);
  });

  it('no reasigna un enlace que ya tiene dueño', async () => {
    const { nonce } = await issueLoginNonce(db, NOW);
    const owner = await seedUser(db, 100_001);
    const intruder = await seedUser(db, 100_002);

    expect(await attachTelegramUser(db, nonce, owner, minutesAfter(1))).toBe(true);
    // Quien consiguiera un nonce ajeno sin canjear no puede atarlo a su cuenta: si pudiera,
    // la PWA de la víctima acabaría abriendo sesión en la cuenta del intruso.
    expect(await attachTelegramUser(db, nonce, intruder, minutesAfter(2))).toBe(false);

    expect(await claimLoginNonce(db, nonce, minutesAfter(3))).toEqual({
      status: 'ready',
      userId: owner,
    });
  });

  it('rechaza un nonce inventado sin distinguirlo de uno caducado', async () => {
    await issueLoginNonce(db, NOW);

    expect(await claimLoginNonce(db, generateNonce(), minutesAfter(1))).toEqual({
      status: 'invalid',
    });
    expect(await attachTelegramUser(db, generateNonce(), 'nadie', minutesAfter(1))).toBe(false);
  });

  it('rechaza un nonce manipulado en un solo carácter', async () => {
    const { nonce } = await issueLoginNonce(db, NOW);
    const tampered = `${nonce.slice(0, -1)}${nonce.endsWith('A') ? 'B' : 'A'}`;

    expect(await claimLoginNonce(db, tampered, minutesAfter(1))).toEqual({ status: 'invalid' });
  });

  it('barre los enlaces caducados y deja los vivos', async () => {
    const stale = await issueLoginNonce(db, NOW);
    const fresh = await issueLoginNonce(db, minutesAfter(9));

    expect(await purgeExpiredNonces(db, minutesAfter(12))).toBe(1);

    const [survivor] = await db
      .select()
      .from(loginNonce)
      .where(eq(loginNonce.nonceHash, await hashNonce(fresh.nonce)));
    expect(survivor).toBeDefined();
    expect(await claimLoginNonce(db, stale.nonce, minutesAfter(12))).toEqual({ status: 'invalid' });
  });
});
