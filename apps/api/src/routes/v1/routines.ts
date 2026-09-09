import { createRoutineRequestSchema, updateRoutineRequestSchema } from '@gymbuddy/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { createDatabase } from '../../db/client';
import { requireUser, type AuthenticatedEnv } from '../../http/current-user';
import { parseJsonBody, parseQuery } from '../../http/query';
import {
  createRoutine,
  findRoutine,
  listRoutines,
  routineNotFound,
  updateRoutine,
} from '../../training/index';

/**
 * Las archivadas quedan fuera salvo que se pidan: son las que el usuario dejó de hacer, y
 * la lista del editor no debe empezar con el historial de todas las que probó.
 */
const listQuerySchema = z.object({
  includeArchived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export const routinesRoute = new Hono<AuthenticatedEnv>()
  .use('/routines', requireUser)
  .use('/routines/*', requireUser)

  .get('/routines', async (c) => {
    const { includeArchived } = parseQuery(c, listQuerySchema);

    return c.json(
      await listRoutines(createDatabase(c.env.DB), c.get('user').id, { includeArchived }),
    );
  })

  .post('/routines', async (c) => {
    const request = await parseJsonBody(c, createRoutineRequestSchema);

    const { routine, created } = await createRoutine(
      createDatabase(c.env.DB),
      c.get('user').id,
      request,
      new Date(),
    );

    // 200 en el reenvío: repetir el alta desde la cola offline no es un recurso nuevo.
    return c.json(routine, created ? 201 : 200);
  })

  .get('/routines/:id', async (c) => {
    const routineId = c.req.param('id');

    const routine = await findRoutine(createDatabase(c.env.DB), c.get('user').id, routineId);
    if (routine === null) throw routineNotFound(routineId);

    return c.json(routine);
  })

  /** No hay `DELETE`: la baja es blanda y se pide con `{"archived": true}`. */
  .patch('/routines/:id', async (c) => {
    const request = await parseJsonBody(c, updateRoutineRequestSchema);

    return c.json(
      await updateRoutine(
        createDatabase(c.env.DB),
        c.get('user').id,
        c.req.param('id'),
        request,
        new Date(),
      ),
    );
  });
