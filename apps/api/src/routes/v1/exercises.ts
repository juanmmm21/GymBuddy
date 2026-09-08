import {
  createTrackedExerciseRequestSchema,
  localeSchema,
  updateTrackedExerciseRequestSchema,
} from '@gymbuddy/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { createDatabase } from '../../db/client';
import { requireUser, type AuthenticatedEnv } from '../../http/current-user';
import { parseJsonBody, parseQuery } from '../../http/query';
import {
  createTrackedExercise,
  exerciseNotFound,
  findTrackedExercise,
  listTrackedExercises,
  updateTrackedExercise,
} from '../../training/index';

/**
 * El idioma sale del perfil salvo que se pida otro: solo afecta al nombre que viene del
 * catálogo, porque el de un ejercicio propio lo escribió el usuario.
 */
const listQuerySchema = z.object({
  lang: localeSchema.optional(),
  includeArchived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

const detailQuerySchema = z.object({ lang: localeSchema.optional() });

export const exercisesRoute = new Hono<AuthenticatedEnv>()
  .use('/exercises', requireUser)
  .use('/exercises/*', requireUser)

  .get('/exercises', async (c) => {
    const user = c.get('user');
    const { lang, includeArchived } = parseQuery(c, listQuerySchema);

    return c.json(
      await listTrackedExercises(createDatabase(c.env.DB), user.id, {
        locale: lang ?? user.locale,
        includeArchived,
      }),
    );
  })

  .post('/exercises', async (c) => {
    const user = c.get('user');
    const request = await parseJsonBody(c, createTrackedExerciseRequestSchema);

    const { exercise, created } = await createTrackedExercise(
      createDatabase(c.env.DB),
      user.id,
      request,
      user.locale,
      new Date(),
    );

    // 200 en el reenvío: la cola offline repite el alta y eso no es un recurso nuevo.
    return c.json(exercise, created ? 201 : 200);
  })

  .get('/exercises/:id', async (c) => {
    const user = c.get('user');
    const { lang } = parseQuery(c, detailQuerySchema);
    const exerciseId = c.req.param('id');

    const exercise = await findTrackedExercise(
      createDatabase(c.env.DB),
      user.id,
      exerciseId,
      lang ?? user.locale,
    );
    if (exercise === null) throw exerciseNotFound(exerciseId);

    return c.json(exercise);
  })

  .patch('/exercises/:id', async (c) => {
    const user = c.get('user');
    const request = await parseJsonBody(c, updateTrackedExerciseRequestSchema);

    return c.json(
      await updateTrackedExercise(
        createDatabase(c.env.DB),
        user.id,
        c.req.param('id'),
        request,
        user.locale,
        new Date(),
      ),
    );
  });
