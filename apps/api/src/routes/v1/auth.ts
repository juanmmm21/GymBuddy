import {
  claimSessionRequestSchema,
  type ClaimSessionResponse,
  type LoginNonce,
  type Session,
} from '@gymbuddy/shared';
import { Hono } from 'hono';
import { issueSessionToken } from '../../auth/jwt';
import { claimLoginNonce, issueLoginNonce } from '../../auth/nonce';
import { findUserById, toUser } from '../../auth/users';
import { createDatabase } from '../../db/client';
import { requireUser, type AuthenticatedEnv } from '../../http/current-user';
import { readSecret } from '../../http/env';
import { ApiException } from '../../http/errors';

export const authRoute = new Hono<AuthenticatedEnv>()
  /**
   * Arranca la entrada: la PWA pide un nonce y abre el enlace que se devuelve. No hay
   * ningún dato del usuario todavía, así que esta ruta es necesariamente pública.
   */
  .post('/auth/nonce', async (c) => {
    const { nonce, expiresAt } = await issueLoginNonce(createDatabase(c.env.DB), new Date());

    const body: LoginNonce = {
      nonce,
      expiresAt,
      telegramLink: `https://t.me/${c.env.TELEGRAM_BOT_USERNAME}?start=${nonce}`,
    };

    return c.json(body, 201);
  })

  /**
   * Canjea el nonce por la sesión. La PWA la llama en bucle con backoff mientras responda
   * `pending`; en cuanto el usuario pulsa *Start* en Telegram, pasa a `ready` y trae el JWT.
   */
  .post('/auth/claim', async (c) => {
    const parsed = claimSessionRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiException('validation_failed', 'Hace falta el nonce del enlace');
    }

    const secret = requireJwtSecret(readSecret(c.env, 'JWT_SECRET'));
    const db = createDatabase(c.env.DB);
    const now = new Date();

    const claim = await claimLoginNonce(db, parsed.data.nonce, now);
    if (claim.status === 'invalid') {
      throw new ApiException('nonce_invalid', 'El enlace de entrada ya no sirve');
    }

    if (claim.status === 'pending') {
      const pending: ClaimSessionResponse = { status: 'pending' };
      return c.json(pending);
    }

    const row = await findUserById(db, claim.userId);
    if (row === null) {
      // El nonce quedó atado a un usuario que ya no existe: el enlace se consumió al
      // canjearlo, así que no hay nada que reintentar con él.
      throw new ApiException('nonce_invalid', 'El enlace de entrada ya no sirve');
    }

    const { token, expiresAt } = await issueSessionToken(row.id, secret, now);
    const session: Session = { token, expiresAt, user: toUser(row) };
    const ready: ClaimSessionResponse = { status: 'ready', session };

    return c.json(ready);
  })

  .get('/auth/me', requireUser, (c) => c.json(toUser(c.get('user'))));

/** Un despliegue sin `JWT_SECRET` no puede emitir sesiones; es un 500, no un 401. */
function requireJwtSecret(secret: string | undefined): string {
  if (secret === undefined) {
    console.error('JWT_SECRET no está configurado: no se pueden emitir sesiones');
    throw new ApiException('internal_error', 'El servidor no puede emitir la sesión');
  }

  return secret;
}
