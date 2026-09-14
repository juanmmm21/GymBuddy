import type { MiddlewareHandler } from 'hono';
import { createDatabase } from '../db/client';
import { closeIdleSession } from '../training/index';
import type { AuthenticatedEnv } from './current-user';

/**
 * Cierra la sesión inactiva de quien pregunta antes de atender la ruta (ADR 0008). Va detrás de
 * `requireUser` en todo lo que lee o escribe sesiones —la propia sesión, el historial, las
 * estadísticas y la copia—, para que ninguna de esas respuestas vea abierta una sesión abandonada.
 */
export const closeIdleSessions: MiddlewareHandler<AuthenticatedEnv> = async (c, next) => {
  await closeIdleSession(createDatabase(c.env.DB), c.get('user').id, new Date());
  await next();
};
