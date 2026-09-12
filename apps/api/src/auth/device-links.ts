import { DEVICE_LINK_CODE_LENGTH, type DeviceLink } from '@gymbuddy/shared';
import { and, eq, gt, isNull, lt } from 'drizzle-orm';
import type { Database } from '../db/client';
import { deviceLink } from '../db/schema';
import { generateAccessCode } from './access-codes';
import { sha256Hex } from './digest';

/**
 * Diez minutos. El código se dicta o se teclea del tirón entre dos móviles que están encima de
 * la mesa: si se deja a medias, es preferible pedir otro a que el anterior siga valiendo.
 */
export const DEVICE_LINK_TTL_MS = 10 * 60 * 1000;

/** Un código de enlace nuevo. */
export function generateDeviceLinkCode(): string {
  return generateAccessCode(DEVICE_LINK_CODE_LENGTH);
}

/** El digest con el que se guarda y se busca un código ya en su forma canónica. */
export function hashDeviceLinkCode(code: string): Promise<string> {
  return sha256Hex(code);
}

/**
 * Crea el código con el que otro dispositivo se suma a esta cuenta. Retira antes los que esa
 * cuenta tuviera sin usar: pedir uno nuevo porque el anterior se escribió mal deja de valer el
 * viejo, y así una cuenta nunca acumula más de una fila.
 */
export async function issueDeviceLink(
  db: Database,
  userId: string,
  now: Date,
): Promise<DeviceLink> {
  const code = generateDeviceLinkCode();
  const expiresAt = new Date(now.getTime() + DEVICE_LINK_TTL_MS).toISOString();

  await db.delete(deviceLink).where(eq(deviceLink.userId, userId));
  await db.insert(deviceLink).values({
    codeHash: await hashDeviceLinkCode(code),
    userId,
    createdAt: now.toISOString(),
    expiresAt,
    usedAt: null,
  });

  return { code, expiresAt };
}

/**
 * La cuenta a la que lleva un código que sirve ahora mismo, o `null`. No lo consume: eso pasa
 * cuando la passkey del dispositivo nuevo ya está verificada.
 */
export async function findLinkedUserId(
  db: Database,
  codeHash: string,
  now: Date,
): Promise<string | null> {
  const [row] = await db
    .select({ userId: deviceLink.userId })
    .from(deviceLink)
    .where(usableDeviceLink(codeHash, now))
    .limit(1);

  return row?.userId ?? null;
}

/**
 * Consume el código. El sellado va en el propio `UPDATE` condicionado a que siga sin usar: de
 * dos dispositivos que lo presenten a la vez, solo uno toca la fila.
 */
export async function consumeDeviceLink(
  db: Database,
  codeHash: string,
  now: Date,
): Promise<boolean> {
  const consumed = await db
    .update(deviceLink)
    .set({ usedAt: now.toISOString() })
    .where(usableDeviceLink(codeHash, now))
    .returning({ codeHash: deviceLink.codeHash });

  return consumed.length > 0;
}

/**
 * Deja libre un código consumido por un enlace que no llegó a guardar la passkey. Solo toca el
 * que selló ese mismo intento (mismo `used_at`).
 */
export async function releaseDeviceLink(
  db: Database,
  codeHash: string,
  usedAt: string,
): Promise<void> {
  await db
    .update(deviceLink)
    .set({ usedAt: null })
    .where(and(eq(deviceLink.codeHash, codeHash), eq(deviceLink.usedAt, usedAt)));
}

/**
 * Barre los códigos caducados. Lo llama el Cron Trigger junto a los retos: uno caducado ya no
 * sirve ni usado ni sin usar, y el que nadie sustituye no se iría solo.
 */
export async function purgeExpiredDeviceLinks(db: Database, now: Date): Promise<number> {
  const removed = await db
    .delete(deviceLink)
    .where(lt(deviceLink.expiresAt, now.toISOString()))
    .returning({ codeHash: deviceLink.codeHash });

  return removed.length;
}

function usableDeviceLink(codeHash: string, now: Date) {
  return and(
    eq(deviceLink.codeHash, codeHash),
    isNull(deviceLink.usedAt),
    // Las marcas son ISO 8601 UTC, así que comparan bien como texto.
    gt(deviceLink.expiresAt, now.toISOString()),
  );
}
