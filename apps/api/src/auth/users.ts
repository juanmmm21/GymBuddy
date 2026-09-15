import type { UpdateUserRequest, User } from '@gymbuddy/shared';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import { user, type UserRow } from '../db/schema';

export async function findUserById(db: Database, userId: string): Promise<UserRow | null> {
  const [row] = await db.select().from(user).where(eq(user.id, userId)).limit(1);

  return row ?? null;
}

/**
 * Aplica los campos que trae la petición y devuelve la fila como queda. Sin ninguno no escribe:
 * un `PATCH` vacío no gasta una escritura de D1. `null` si la cuenta ya no existe.
 */
export async function updateUser(
  db: Database,
  userId: string,
  patch: UpdateUserRequest,
): Promise<UserRow | null> {
  const changes: Partial<Pick<UserRow, 'displayName' | 'locale' | 'unitSystem'>> = {};
  if (patch.displayName !== undefined) changes.displayName = patch.displayName;
  if (patch.locale !== undefined) changes.locale = patch.locale;
  if (patch.unitSystem !== undefined) changes.unitSystem = patch.unitSystem;

  if (Object.keys(changes).length === 0) return findUserById(db, userId);

  const [row] = await db.update(user).set(changes).where(eq(user.id, userId)).returning();

  return row ?? null;
}

/** Traduce una fila a la forma que expone el contrato de la API. */
export function toUser(row: UserRow): User {
  return {
    id: row.id,
    displayName: row.displayName,
    locale: row.locale,
    unitSystem: row.unitSystem,
    createdAt: row.createdAt,
  };
}
