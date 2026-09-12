import { INVITATION_CODE_LENGTH, type Invitation } from '@gymbuddy/shared';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Database } from '../db/client';
import { invitation } from '../db/schema';
import { generateAccessCode } from './access-codes';
import { sha256Hex } from './digest';

/** Una semana: lo que tarda alguien en abrir el mensaje y ponerse a ello sin prisa. */
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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
