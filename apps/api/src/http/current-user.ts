import { SESSION_REFRESH_EXPIRES_HEADER, SESSION_REFRESH_TOKEN_HEADER } from '@gymbuddy/shared';
import type { MiddlewareHandler } from 'hono';
import { issueSessionToken, shouldRenewSession, verifySessionToken } from '../auth/jwt';
import { findUserById } from '../auth/users';
import { createDatabase } from '../db/client';
import type { UserRow } from '../db/schema';
import { readSecret } from './env';
import { ApiException } from './errors';

/** Lo que el middleware deja en el contexto para las rutas que van detrás. */
export interface AuthVariables {
  user: UserRow;
}

export type AuthenticatedEnv = { Bindings: Env; Variables: AuthVariables };

const BEARER_PREFIX = 'Bearer ';

/**
 * Exige una sesión válida y deja el usuario en el contexto. Todo lo que cuelga de un
 * usuario pasa por aquí; el catálogo no, porque no es de nadie.
 */
export const requireUser: MiddlewareHandler<AuthenticatedEnv> = async (c, next) => {
  const unauthorized = new ApiException('unauthorized', 'Hace falta una sesión válida');
  const now = new Date();

  const header = c.req.header('authorization');
  if (header === undefined || !header.startsWith(BEARER_PREFIX)) throw unauthorized;

  const secret = readSecret(c.env, 'JWT_SECRET');
  if (secret === undefined) {
    // Sin secreto no se puede verificar nada, y responder 401 haría pensar que el token es
    // el problema. Es un fallo de despliegue y se registra como tal.
    console.error('JWT_SECRET no está configurado: ninguna sesión puede verificarse');
    throw new ApiException('internal_error', 'El servidor no puede validar la sesión');
  }

  const verified = await verifySessionToken(header.slice(BEARER_PREFIX.length), secret);
  if (verified === null) throw unauthorized;

  // El usuario se recarga en cada petición: un token sigue siendo válido hasta caducar,
  // pero si la cuenta ya no está, la sesión no vale de nada.
  const row = await findUserById(createDatabase(c.env.DB), verified.userId);
  if (row === null) throw unauthorized;

  c.set('user', row);

  await next();

  // La sesión se renueva al usarse: si al token le quedaba menos de la mitad de vida, la
  // respuesta se lleva uno nuevo y el dispositivo lo guarda. El token viejo no se invalida —
  // no hay dónde apuntarlo—, así que una petición que ya iba en camino con él sigue valiendo.
  //
  // Va después de `next()` por dos razones: una petición que falla no renueva nada (ya se lo
  // llevará la siguiente que salga bien), y así la cabecera se pega a la respuesta ya hecha,
  // incluso a un 204 sin cuerpo.
  if (shouldRenewSession(verified, now)) {
    const renewed = await issueSessionToken(verified.userId, secret, now);
    c.header(SESSION_REFRESH_TOKEN_HEADER, renewed.token);
    c.header(SESSION_REFRESH_EXPIRES_HEADER, renewed.expiresAt);
  }
};
