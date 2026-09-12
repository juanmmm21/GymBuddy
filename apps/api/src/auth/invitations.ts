import {
  INVITATION_CODE_LENGTH,
  type Invitation,
  type InvitationStatus,
  type PendingInvitation,
} from '@gymbuddy/shared';
import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import type { Database } from '../db/client';
import { invitation } from '../db/schema';
import { ApiException } from '../http/errors';
import { generateAccessCode } from './access-codes';
import { sha256Hex } from './digest';

/** Una semana: lo que tarda alguien en abrir el mensaje y ponerse a ello sin prisa. */
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Cuántas invitaciones sin usar puede tener a la vez quien invita desde la app. El alta va por
 * invitación justamente para que no se abra sola: tres cubren invitar a unos amigos de una
 * tanda y ponen techo a lo que un usuario puede escribir en la D1 del plan gratuito. Las que se
 * usan o caducan dejan hueco, así que no es un tope de por vida.
 */
export const MAX_PENDING_INVITATIONS = 3;

export interface IssueInvitationOptions {
  /** Quien la genera desde la app; `null` si sale del secreto de administración. */
  readonly createdByUserId: string | null;
  readonly now: Date;
}

/** Un código de invitación nuevo. */
export function generateInvitationCode(): string {
  return generateAccessCode(INVITATION_CODE_LENGTH);
}

/** El digest con el que se guarda y se busca un código ya en su forma canónica. */
export function hashInvitationCode(code: string): Promise<string> {
  return sha256Hex(code);
}

/** Crea una invitación. Es la única vez que el código existe en claro. */
export async function issueInvitation(
  db: Database,
  options: IssueInvitationOptions,
): Promise<Invitation> {
  const code = generateInvitationCode();
  const expiresAt = new Date(options.now.getTime() + INVITATION_TTL_MS).toISOString();

  await db.insert(invitation).values({
    codeHash: await hashInvitationCode(code),
    createdByUserId: options.createdByUserId,
    createdAt: options.now.toISOString(),
    expiresAt,
    usedAt: null,
    usedByUserId: null,
  });

  return { code, expiresAt };
}

/**
 * Las invitaciones que ese usuario generó y siguen vivas, de la que antes caduca a la que
 * después. Sin el código: solo se guardó su digest, así que lo que se puede enseñar es cuántas
 * quedan y hasta cuándo valen.
 */
export async function listPendingInvitations(
  db: Database,
  userId: string,
  now: Date,
): Promise<PendingInvitation[]> {
  return db
    .select({ createdAt: invitation.createdAt, expiresAt: invitation.expiresAt })
    .from(invitation)
    .where(
      and(
        eq(invitation.createdByUserId, userId),
        isNull(invitation.usedAt),
        // Las marcas son ISO 8601 UTC, así que comparan bien como texto.
        gt(invitation.expiresAt, now.toISOString()),
      ),
    )
    .orderBy(asc(invitation.expiresAt))
    .limit(MAX_PENDING_INVITATIONS);
}

/** Lo que la pantalla necesita para decidir si ofrecer otro código o explicar por qué no. */
export async function readInvitationStatus(
  db: Database,
  userId: string,
  now: Date,
): Promise<InvitationStatus> {
  const pending = await listPendingInvitations(db, userId, now);

  return {
    limit: MAX_PENDING_INVITATIONS,
    remaining: Math.max(MAX_PENDING_INVITATIONS - pending.length, 0),
    pending,
  };
}

/**
 * Una invitación pedida desde la app, con el tope aplicado. La cuenta de vivas y el alta no van
 * en una transacción a propósito: dos peticiones a la vez podrían dejar una invitación de más,
 * y eso da igual — lo que el tope evita es que una cuenta genere códigos sin freno, no que haya
 * exactamente tres.
 */
export async function issueInvitationForUser(
  db: Database,
  userId: string,
  now: Date,
): Promise<Invitation> {
  const { remaining, limit } = await readInvitationStatus(db, userId, now);
  if (remaining === 0) {
    throw new ApiException(
      'invitation_limit_reached',
      `Ya tienes ${String(limit)} invitaciones sin usar. Espera a que alguien use una o a que caduque.`,
      { limit },
    );
  }

  return issueInvitation(db, { createdByUserId: userId, now });
}

/**
 * Si la invitación sirve ahora mismo. No la consume: eso pasa solo cuando la passkey ya se ha
 * verificado, para que un registro cancelado a mitad no la gaste.
 */
export async function isInvitationUsable(
  db: Database,
  codeHash: string,
  now: Date,
): Promise<boolean> {
  const [row] = await db
    .select({ codeHash: invitation.codeHash })
    .from(invitation)
    .where(usableInvitation(codeHash, now))
    .limit(1);

  return row !== undefined;
}

/**
 * Consume la invitación. El sellado va en el propio `UPDATE` condicionado a que siga sin usar:
 * de dos registros simultáneos con el mismo código, solo uno toca la fila.
 */
export async function consumeInvitation(
  db: Database,
  codeHash: string,
  now: Date,
): Promise<boolean> {
  const consumed = await db
    .update(invitation)
    .set({ usedAt: now.toISOString() })
    .where(usableInvitation(codeHash, now))
    .returning({ codeHash: invitation.codeHash });

  return consumed.length > 0;
}

/**
 * Deja libre una invitación consumida por un registro que no llegó a crear la cuenta. Solo
 * toca la que selló ese mismo intento (mismo `used_at`) y todavía no tiene dueño.
 */
export async function releaseInvitation(
  db: Database,
  codeHash: string,
  usedAt: string,
): Promise<void> {
  await db
    .update(invitation)
    .set({ usedAt: null })
    .where(
      and(
        eq(invitation.codeHash, codeHash),
        eq(invitation.usedAt, usedAt),
        isNull(invitation.usedByUserId),
      ),
    );
}

function usableInvitation(codeHash: string, now: Date) {
  return and(
    eq(invitation.codeHash, codeHash),
    isNull(invitation.usedAt),
    // Las marcas son ISO 8601 UTC, así que comparan bien como texto.
    gt(invitation.expiresAt, now.toISOString()),
  );
}
