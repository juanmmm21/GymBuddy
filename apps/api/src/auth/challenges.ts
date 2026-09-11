import type { Locale } from '@gymbuddy/shared';
import { and, eq, lt } from 'drizzle-orm';
import type { Database } from '../db/client';
import { authChallenge, type AuthChallengeRow } from '../db/schema';

/**
 * Cinco minutos. El navegador se rinde antes (ver `CEREMONY_TIMEOUT_MS` en `passkeys.ts`); el
 * margen es para que la respuesta no llegue tarde por culpa de la red del gimnasio.
 */
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/** La cuenta que se creará si la passkey verifica. Se decide al pedir las opciones. */
export interface PendingRegistration {
  readonly userId: string;
  readonly displayName: string;
  readonly locale: Locale;
  readonly invitationHash: string;
}

export interface RegistrationChallenge {
  readonly challenge: string;
  readonly registration: PendingRegistration;
}

export type NewChallenge =
  | {
      readonly kind: 'registration';
      readonly challenge: string;
      readonly registration: PendingRegistration;
    }
  | { readonly kind: 'authentication'; readonly challenge: string };

/** Guarda el reto de una ceremonia que empieza y devuelve su identificador. */
export async function storeChallenge(
  db: Database,
  challenge: NewChallenge,
  now: Date,
): Promise<string> {
  const id = crypto.randomUUID();
  const registration = challenge.kind === 'registration' ? challenge.registration : null;

  await db.insert(authChallenge).values({
    id,
    kind: challenge.kind,
    challenge: challenge.challenge,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS).toISOString(),
    pendingUserId: registration?.userId ?? null,
    displayName: registration?.displayName ?? null,
    locale: registration?.locale ?? null,
    invitationHash: registration?.invitationHash ?? null,
  });

  return id;
}

/** Retira el reto de un registro y lo devuelve si seguía vivo. Ver `takeChallenge`. */
export async function takeRegistrationChallenge(
  db: Database,
  id: string,
  now: Date,
): Promise<RegistrationChallenge | null> {
  const row = await takeChallenge(db, id, 'registration', now);
  if (row === null) return null;

  const { pendingUserId, displayName, locale, invitationHash } = row;
  if (
    pendingUserId === null ||
    displayName === null ||
    locale === null ||
    invitationHash === null
  ) {
    // El CHECK de la tabla lo impide; si pasa, la base está corrupta y no hay registro que seguir.
    console.error('Reto de registro sin los datos de la cuenta pendiente', { id });
    return null;
  }

  return {
    challenge: row.challenge,
    registration: { userId: pendingUserId, displayName, locale, invitationHash },
  };
}

/** Retira el reto de una entrada y devuelve el valor que tuvo que firmarse, si seguía vivo. */
export async function takeAuthenticationChallenge(
  db: Database,
  id: string,
  now: Date,
): Promise<string | null> {
  const row = await takeChallenge(db, id, 'authentication', now);

  return row?.challenge ?? null;
}

/**
 * Barre los retos caducados. Lo llama el Cron Trigger: cada intento de entrada deja una fila,
 * y las de quien cerró la app a mitad no se borrarían nunca solas.
 */
export async function purgeExpiredChallenges(db: Database, now: Date): Promise<number> {
  const removed = await db
    .delete(authChallenge)
    .where(lt(authChallenge.expiresAt, now.toISOString()))
    .returning({ id: authChallenge.id });

  return removed.length;
}

/**
 * Borra el reto al leerlo, en la misma sentencia, y solo después mira si había caducado. Así
 * se presenta una sola vez aunque la verificación que viene detrás falle, y dos peticiones
 * con el mismo reto no pueden llevárselo las dos.
 */
async function takeChallenge(
  db: Database,
  id: string,
  kind: AuthChallengeRow['kind'],
  now: Date,
): Promise<AuthChallengeRow | null> {
  const [row] = await db
    .delete(authChallenge)
    .where(and(eq(authChallenge.id, id), eq(authChallenge.kind, kind)))
    .returning();

  if (row === undefined || row.expiresAt <= now.toISOString()) return null;

  return row;
}
