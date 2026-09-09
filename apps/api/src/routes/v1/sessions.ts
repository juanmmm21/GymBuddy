import {
  endSessionRequestSchema,
  logSetRequestSchema,
  startSessionRequestSchema,
  updateSetRequestSchema,
  type ActiveSessionResponse,
  type LogSetResponse,
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
  removeSet,
  sessionNotFound,
  startWorkoutSession,
  updateSet,
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

    const { set, records, created } = await logSet(
      createDatabase(c.env.DB),
      c.get('user').id,
      c.req.param('id'),
      request,
      new Date(),
    );
    const body: LogSetResponse = { set, records };

    return c.json(body, created ? 201 : 200);
  })

  /**
   * Corregir una serie mal metida. Responde lo mismo que registrarla —la serie y las
   * marcas— porque corregir al alza también puede batir un récord.
   */
  .patch('/sessions/:id/sets/:setId', async (c) => {
    const request = await parseJsonBody(c, updateSetRequestSchema);

    const { set, records } = await updateSet(
      createDatabase(c.env.DB),
      c.get('user').id,
      c.req.param('id'),
      c.req.param('setId'),
      request,
    );
    const body: LogSetResponse = { set, records };

    return c.json(body);
  })

  // 204 y sin cuerpo: no queda recurso que devolver, y la pantalla relee la sesión.
  .delete('/sessions/:id/sets/:setId', async (c) => {
    await removeSet(
      createDatabase(c.env.DB),
      c.get('user').id,
      c.req.param('id'),
      c.req.param('setId'),
    );

    return c.body(null, 204);
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
