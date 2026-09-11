import type { User } from '@gymbuddy/shared';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import { user, type UserRow } from '../db/schema';

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
