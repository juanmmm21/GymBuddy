import {
  endSessionRequestSchema,
  logSetRequestSchema,
  startSessionRequestSchema,
  type ActiveSessionResponse,
} from '@gymbuddy/shared';
import { Hono } from 'hono';
import { createDatabase } from '../../db/client';
import { requireUser, type AuthenticatedEnv } from '../../http/current-user';
import { parseJsonBody } from '../../http/query';
import {
  endWorkoutSession,
  findActiveSession,
  findSessionDetail,
  logSet,
  sessionNotFound,
  startWorkoutSession,
} from '../../training/index';

export const sessionsRoute = new Hono<AuthenticatedEnv>()
  .use('/sessions', requireUser)
  .use('/sessions/*', requireUser)

  .post('/sessions', async (c) => {
    const request = await parseJsonBody(c, startSessionRequestSchema);

    const { session, created } = await startWorkoutSession(
      createDatabase(c.env.DB),
      c.get('user').id,
      request,
      new Date(),
    );

    return c.json(session, created ? 201 : 200);
  })

  /**
   * Va declarada antes que `/sessions/:id` para que "active" no se lea como un
   * identificador. Responde `{"session": null}` y no 404: no haber empezado a entrenar
   * es el estado normal de la pantalla, no un error.
   */
  .get('/sessions/active', async (c) => {
    const session = await findActiveSession(createDatabase(c.env.DB), c.get('user').id);
    const body: ActiveSessionResponse = { session };

    return c.json(body);
  })

  .get('/sessions/:id', async (c) => {
    const sessionId = c.req.param('id');

    const session = await findSessionDetail(createDatabase(c.env.DB), c.get('user').id, sessionId);
    if (session === null) throw sessionNotFound(sessionId);

    return c.json(session);
  })

  .post('/sessions/:id/sets', async (c) => {
    const request = await parseJsonBody(c, logSetRequestSchema);

    const { set, created } = await logSet(
      createDatabase(c.env.DB),
      c.get('user').id,
      c.req.param('id'),
      request,
      new Date(),
    );

    return c.json(set, created ? 201 : 200);
  })

  .post('/sessions/:id/end', async (c) => {
    const request = await parseJsonBody(c, endSessionRequestSchema);

    return c.json(
      await endWorkoutSession(
        createDatabase(c.env.DB),
        c.get('user').id,
        c.req.param('id'),
        request,
        new Date(),
      ),
    );
  });
