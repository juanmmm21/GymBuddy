import {
  INVITATION_CODE_LENGTH,
  type Invitation,
  type InvitationQuota,
  type InvitationStatus,
  type PendingInvitation,
} from '@gymbuddy/shared';
import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { invitation } from '../db/schema';
import { ApiException } from '../http/errors';
import { generateAccessCode } from './access-codes';
import { sha256Hex } from './digest';

/** Una semana: lo que tarda alguien en abrir el mensaje y ponerse a ello sin prisa. */
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Cuántas puede crear una cuenta normal en la ventana. Pocas a propósito: el alta va por
 * invitación para no agotar el gratuito de D1, y cada cuenta nueva trae su propio cupo, así que
 * un tope alto dejaría crecer la app en cadena a partir de una sola invitación mal dada.
 */
export const INVITATION_LIMIT = 3;
export const INVITATION_LIMIT_WINDOW_DAYS = 30;
const INVITATION_LIMIT_WINDOW_MS = INVITATION_LIMIT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** Lo que hace falta saber de quien pide: su cuenta y si es la de administración. */
export interface Inviter {
  readonly id: string;
  readonly isAdmin: boolean;
}

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
 * Crea una invitación a nombre de una cuenta, respetando su cupo si no es la de administración.
 * El cupo se comprueba dentro del propio `INSERT`: con una lectura previa, varias peticiones a la
 * vez verían todas hueco y se colarían todas.
 */
export async function issueInvitationFor(
  db: Database,
  inviter: Inviter,
  now: Date,
): Promise<Invitation> {
  if (inviter.isAdmin) return issueInvitation(db, { createdByUserId: inviter.id, now });

  const code = generateInvitationCode();
  const codeHash = await hashInvitationCode(code);
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS).toISOString();
  const windowStart = new Date(now.getTime() - INVITATION_LIMIT_WINDOW_MS).toISOString();

  // SQL a mano porque Drizzle no sabe condicionar un INSERT de una fila a un recuento.
  const result = await db.run(sql`
    INSERT INTO invitation (code_hash, created_by_user_id, created_at, expires_at)
    SELECT ${codeHash}, ${inviter.id}, ${createdAt}, ${expiresAt}
    WHERE (
      SELECT count(*) FROM invitation
      WHERE created_by_user_id = ${inviter.id} AND created_at > ${windowStart}
    ) < ${INVITATION_LIMIT}
  `);

  if (result.meta.changes === 0) {
    const quota = await readInvitationQuota(db, inviter.id, now);
    throw new ApiException(
      'invitation_limit_reached',
      `Solo se pueden crear ${String(INVITATION_LIMIT)} invitaciones cada ${String(INVITATION_LIMIT_WINDOW_DAYS)} días`,
      { renewsAt: quota.renewsAt },
    );
  }

  return { code, expiresAt };
}

/**
 * El cupo de una cuenta normal. Las marcas son ISO 8601 UTC y comparan bien como texto, igual
 * que en el resto del módulo.
 */
export async function readInvitationQuota(
  db: Database,
  userId: string,
  now: Date,
): Promise<InvitationQuota> {
  const windowStart = new Date(now.getTime() - INVITATION_LIMIT_WINDOW_MS).toISOString();
  const recent = await db
    .select({ createdAt: invitation.createdAt })
    .from(invitation)
    .where(and(eq(invitation.createdByUserId, userId), gt(invitation.createdAt, windowStart)))
    .orderBy(asc(invitation.createdAt));

  const remaining = Math.max(0, INVITATION_LIMIT - recent.length);
  // Vuelve a haber hueco cuando sale de la ventana la que deja el recuento justo en el tope.
  const blocking = remaining === 0 ? recent[recent.length - INVITATION_LIMIT] : undefined;
  const renewsAt =
    blocking === undefined
      ? null
      : new Date(Date.parse(blocking.createdAt) + INVITATION_LIMIT_WINDOW_MS).toISOString();

  return { limit: INVITATION_LIMIT, windowDays: INVITATION_LIMIT_WINDOW_DAYS, remaining, renewsAt };
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
    .orderBy(asc(invitation.expiresAt));
}

/** Lo que la pantalla enseña: las que todavía esperan a alguien y cuántas quedan por crear. */
export async function readInvitationStatus(
  db: Database,
  inviter: Inviter,
  now: Date,
): Promise<InvitationStatus> {
  return {
    pending: await listPendingInvitations(db, inviter.id, now),
    quota: inviter.isAdmin ? null : await readInvitationQuota(db, inviter.id, now),
  };
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
