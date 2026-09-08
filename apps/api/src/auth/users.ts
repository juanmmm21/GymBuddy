import type { Locale, User } from '@gymbuddy/shared';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import { user, type UserRow } from '../db/schema';

/** Lo que Telegram trae ya autenticado en el update del webhook. */
export interface TelegramIdentity {
  readonly telegramUserId: number;
  readonly firstName: string;
  readonly username: string | null;
  readonly languageCode: string | null;
}

export interface ResolvedUser {
  readonly user: UserRow;
  /** Si acaba de crearse. El bot saluda distinto la primera vez. */
  readonly created: boolean;
}

/**
 * Da con el usuario de un `telegram_user_id` o lo crea si es su primera vez. No hay alta
 * ni formulario en ninguna parte: entrar por el enlace del bot *es* el registro (ADR 0003).
 */
export async function findOrCreateTelegramUser(
  db: Database,
  identity: TelegramIdentity,
  now: Date,
): Promise<ResolvedUser> {
  const [existing] = await db
    .select()
    .from(user)
    .where(eq(user.telegramUserId, identity.telegramUserId))
    .limit(1);

  if (existing !== undefined) {
    // El nombre y el alias son de Telegram, no nuestros: se refrescan en cada entrada para
    // que cambiarlos allí no deje aquí un perfil desfasado para siempre.
    const [refreshed] = await db
      .update(user)
      .set({ firstName: identity.firstName, username: identity.username })
      .where(eq(user.id, existing.id))
      .returning();

    return { user: refreshed ?? existing, created: false };
  }

  const [created] = await db
    .insert(user)
    .values({
      id: crypto.randomUUID(),
      telegramUserId: identity.telegramUserId,
      firstName: identity.firstName,
      username: identity.username,
      photoUrl: null,
      locale: localeFrom(identity.languageCode),
      unitSystem: 'metric',
      createdAt: now.toISOString(),
    })
    .returning();

  if (created === undefined) {
    throw new Error('No se pudo crear el usuario a partir de la identidad de Telegram');
  }

  return { user: created, created: true };
}

export async function findUserById(db: Database, userId: string): Promise<UserRow | null> {
  const [row] = await db.select().from(user).where(eq(user.id, userId)).limit(1);

  return row ?? null;
}

/** Traduce una fila a la forma que expone el contrato de la API. */
export function toUser(row: UserRow): User {
  return {
    id: row.id,
    telegramUserId: row.telegramUserId,
    firstName: row.firstName,
    username: row.username,
    photoUrl: row.photoUrl,
    locale: row.locale,
    unitSystem: row.unitSystem,
    createdAt: row.createdAt,
  };
}

/**
 * Telegram manda códigos como `es`, `es-ES` o `pt-BR`. Solo hay dos idiomas en la app, así
 * que cualquier cosa que no empiece por `es` arranca en inglés; el usuario puede cambiarlo.
 */
function localeFrom(languageCode: string | null): Locale {
  return languageCode?.toLowerCase().startsWith('es') === true ? 'es' : 'en';
}
