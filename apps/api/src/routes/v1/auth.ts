import {
  loginVerifyRequestSchema,
  registrationOptionsRequestSchema,
  registrationVerifyRequestSchema,
  type Session,
} from '@gymbuddy/shared';
import { Hono } from 'hono';
import { issueSessionToken } from '../../auth/jwt';
import {
  finishPasskeyLogin,
  finishPasskeyRegistration,
  startPasskeyLogin,
  startPasskeyRegistration,
} from '../../auth/passkeys';
import { readRelyingParty } from '../../auth/relying-party';
import { toUser } from '../../auth/users';
import { createDatabase } from '../../db/client';
import type { UserRow } from '../../db/schema';
import { requireUser, type AuthenticatedEnv } from '../../http/current-user';
import { readSecret } from '../../http/env';
import { ApiException } from '../../http/errors';
import { parseJsonBody } from '../../http/query';

export const authRoute = new Hono<AuthenticatedEnv>()
  /** Registro, paso 1: con qué invitación, nombre e idioma. Devuelve las opciones de la llave. */
  .post('/auth/registration/options', async (c) => {
    const body = await parseJsonBody(c, registrationOptionsRequestSchema);
    const rp = readRelyingParty(c.env);

    return c.json(await startPasskeyRegistration(createDatabase(c.env.DB), rp, body, new Date()));
  })

  /** Registro, paso 2: la llave creada. Crea la cuenta y abre la sesión. */
  .post('/auth/registration/verify', async (c) => {
    const body = await parseJsonBody(c, registrationVerifyRequestSchema);
    // Antes de verificar: un despliegue sin secreto gastaría la invitación sin poder abrir sesión.
    const secret = requireJwtSecret(readSecret(c.env, 'JWT_SECRET'));
    const rp = readRelyingParty(c.env);
    const now = new Date();

    const account = await finishPasskeyRegistration(createDatabase(c.env.DB), rp, body, now);

    return c.json(await sessionFor(account, secret, now), 201);
  })

  /** Entrada, paso 1. Sin cuerpo: no se pregunta quién es, lo dirá la llave. */
  .post('/auth/login/options', async (c) => {
    const rp = readRelyingParty(c.env);

    return c.json(await startPasskeyLogin(createDatabase(c.env.DB), rp, new Date()));
  })

  /** Entrada, paso 2: la firma del móvil a cambio de la sesión. */
  .post('/auth/login/verify', async (c) => {
    const body = await parseJsonBody(c, loginVerifyRequestSchema);
    const secret = requireJwtSecret(readSecret(c.env, 'JWT_SECRET'));
    const rp = readRelyingParty(c.env);
    const now = new Date();

    const account = await finishPasskeyLogin(createDatabase(c.env.DB), rp, body, now);

    return c.json(await sessionFor(account, secret, now));
  })

  .get('/auth/me', requireUser, (c) => c.json(toUser(c.get('user'))));

async function sessionFor(account: UserRow, secret: string, now: Date): Promise<Session> {
  const { token, expiresAt } = await issueSessionToken(account.id, secret, now);

  return { token, expiresAt, user: toUser(account) };
}

/** Un despliegue sin `JWT_SECRET` no puede emitir sesiones; es un 500, no un 401. */
function requireJwtSecret(secret: string | undefined): string {
  if (secret === undefined) {
    console.error('JWT_SECRET no está configurado: no se pueden emitir sesiones');
    throw new ApiException('internal_error', 'El servidor no puede emitir la sesión');
  }

  return secret;
}
