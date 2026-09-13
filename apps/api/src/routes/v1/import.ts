import {
  importExercisesRequestSchema,
  importRoutinesRequestSchema,
  importSessionsRequestSchema,
} from '@gymbuddy/shared';
import { Hono } from 'hono';
import { createDatabase } from '../../db/client';
import { requireUser, type AuthenticatedEnv } from '../../http/current-user';
import { parseJsonBody } from '../../http/query';
import { importExercises, importRoutines, importSessions } from '../../training/index';

/**
 * Recuperar una copia de seguridad en la cuenta con sesión, por lotes: la PWA valida el fichero
 * entero, lo reparte con `planImport` y sube ejercicios, rutinas y sesiones en ese orden. Todo
 * se escribe sobre el usuario del contexto; el fichero no dice a qué cuenta va.
 */
export const importRoute = new Hono<AuthenticatedEnv>()
  .use('/import/*', requireUser)

  .post('/import/exercises', async (c) => {
    const { exercises } = await parseJsonBody(c, importExercisesRequestSchema);

    return c.json(await importExercises(createDatabase(c.env.DB), c.get('user').id, exercises));
  })

  .post('/import/routines', async (c) => {
    const { routines } = await parseJsonBody(c, importRoutinesRequestSchema);
    await importRoutines(createDatabase(c.env.DB), c.get('user').id, routines);

    return c.body(null, 204);
  })

  .post('/import/sessions', async (c) => {
    const { sessions } = await parseJsonBody(c, importSessionsRequestSchema);
    await importSessions(createDatabase(c.env.DB), c.get('user').id, sessions);

    return c.body(null, 204);
  });
