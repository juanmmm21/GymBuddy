import { and, eq, gt, isNull, lt } from 'drizzle-orm';
import type { Database } from '../db/client';
import { loginNonce } from '../db/schema';
import { constantTimeEquals } from '../http/secrets';

/**
 * 32 bytes de entropía. El nonce viaja en una URL de Telegram que puede acabar en el
 * historial del navegador o en una vista previa del chat, así que no puede ser adivinable
 * ni por asomo dentro de su ventana de vida.
 */
const NONCE_BYTES = 32;

/**
 * Diez minutos: lo que tarda alguien en pulsar el enlace, abrir Telegram y darle a *Start*.
 * Más margen solo alarga la ventana en la que un enlace filtrado sirve para entrar.
 */
const NONCE_TTL_MS = 10 * 60 * 1000;

export interface IssuedNonce {
  readonly nonce: string;
  readonly expiresAt: string;
}

/**
 * En qué punto está el enlace: `pending` mientras nadie ha pulsado *Start* —que es
 * funcionamiento normal, no un error—, `ready` cuando ya hay un usuario detrás, e
 * `invalid` si no existe, caducó o ya se canjeó. Los tres motivos de `invalid` se
 * confunden a propósito: distinguirlos confirmaría que un nonce concreto existió.
 */
export type NonceClaim =
  | { readonly status: 'pending' }
  | { readonly status: 'ready'; readonly userId: string }
  | { readonly status: 'invalid' };

/** Genera el nonce que viaja en el enlace. Solo existe en claro fuera de la base. */
export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));

  // base64url: cabe entero en el parámetro `start` de Telegram sin escapar nada.
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

/** El digest que sí se guarda. Ver el comentario de `login_nonce` en el esquema. */
export async function hashNonce(nonce: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce));

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Crea un enlace de entrada. Lo pide la PWA antes de abrir Telegram. */
export async function issueLoginNonce(db: Database, now: Date): Promise<IssuedNonce> {
  const nonce = generateNonce();
  const expiresAt = new Date(now.getTime() + NONCE_TTL_MS).toISOString();

  await db.insert(loginNonce).values({
    nonceHash: await hashNonce(nonce),
    userId: null,
    createdAt: now.toISOString(),
    expiresAt,
    claimedAt: null,
  });

  return { nonce, expiresAt };
}

/**
 * Ata el enlace a quien pulsó *Start* en Telegram. Devuelve `false` si el nonce no sirve,
 * y entonces el bot se lo dice al usuario en vez de dejarle esperando en la app.
 *
 * Un enlace se ata **una sola vez**. Si ya tiene dueño no se reasigna: quien consiguiera un
 * nonce ajeno todavía sin canjear podría, si no, atarlo a su propia cuenta y hacer que la
 * PWA de la víctima abriese sesión en la cuenta del atacante.
 */
export async function attachTelegramUser(
  db: Database,
  nonce: string,
  userId: string,
  now: Date,
): Promise<boolean> {
  const attached = await db
    .update(loginNonce)
    .set({ userId })
    .where(
      and(
        eq(loginNonce.nonceHash, await hashNonce(nonce)),
        // Sin dueño todavía: el primer /start se lo queda y los demás se van de vacío.
        isNull(loginNonce.userId),
        // Un enlace ya usado o caducado no se reactiva: si no, reenviar un mensaje viejo
        // del chat volvería a abrir sesión.
        isNull(loginNonce.claimedAt),
        // Las marcas son ISO 8601 UTC, así que comparan bien como texto.
        gt(loginNonce.expiresAt, now.toISOString()),
      ),
    )
    .returning({ nonceHash: loginNonce.nonceHash });

  return attached.length > 0;
}

/**
 * Canjea el enlace por una sesión. El sellado de `claimed_at` va en el propio `UPDATE`
 * condicionado a que siga nulo: dos canjes simultáneos del mismo nonce no pueden producir
 * dos sesiones, porque solo uno de los dos toca la fila.
 */
export async function claimLoginNonce(db: Database, nonce: string, now: Date): Promise<NonceClaim> {
  const nonceHash = await hashNonce(nonce);

  const [row] = await db
    .select()
    .from(loginNonce)
    .where(eq(loginNonce.nonceHash, nonceHash))
    .limit(1);

  if (row === undefined) return { status: 'invalid' };

  // La búsqueda ya fue por igualdad de digest; esta comparación es defensa en profundidad
  // y no la única barrera: lo que de verdad protege el nonce es no guardarlo en claro.
  if (!(await constantTimeEquals(row.nonceHash, nonceHash))) return { status: 'invalid' };

  if (row.claimedAt !== null || row.expiresAt <= now.toISOString()) return { status: 'invalid' };
  if (row.userId === null) return { status: 'pending' };

  const claimed = await db
    .update(loginNonce)
    .set({ claimedAt: now.toISOString() })
    .where(and(eq(loginNonce.nonceHash, nonceHash), isNull(loginNonce.claimedAt)))
    .returning({ userId: loginNonce.userId });

  const winner = claimed[0]?.userId;

  return winner === undefined || winner === null
    ? { status: 'invalid' }
    : { status: 'ready', userId: winner };
}

/**
 * Barre los enlaces caducados. Lo llama el Cron Trigger: sin esto la tabla crece con un
 * registro por intento de entrada y nunca se vacía sola.
 */
export async function purgeExpiredNonces(db: Database, now: Date): Promise<number> {
  const removed = await db
    .delete(loginNonce)
    .where(lt(loginNonce.expiresAt, now.toISOString()))
    .returning({ nonceHash: loginNonce.nonceHash });

  return removed.length;
}
