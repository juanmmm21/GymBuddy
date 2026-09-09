import { Hono } from 'hono';
import { z } from 'zod';
import { createDatabase } from '../../db/client';
import { requireUser, type AuthenticatedEnv } from '../../http/current-user';
import { parseQuery } from '../../http/query';
import { getExerciseStats, getTrainingSignals, getWeeklyCalendar } from '../../training/index';

/** Diez sesiones llenan la gráfica de un ejercicio semanal sin castigar las filas leídas. */
const DEFAULT_STATS_SESSIONS = 10;
const MAX_STATS_SESSIONS = 50;

const exerciseStatsQuerySchema = z.object({
  sessions: z.coerce.number().int().min(1).max(MAX_STATS_SESSIONS).default(DEFAULT_STATS_SESSIONS),
});

export const statsRoute = new Hono<AuthenticatedEnv>()
  .use('/stats/*', requireUser)

  .get('/stats/exercise/:id', async (c) => {
    const { sessions } = parseQuery(c, exerciseStatsQuerySchema);

    return c.json(
      await getExerciseStats(
        createDatabase(c.env.DB),
        c.get('user').id,
        c.req.param('id'),
        sessions,
      ),
    );
  })

  /** Las señales del usuario entero. No lleva parámetros: es el estado, no una consulta. */
  .get('/stats/signals', async (c) => {
    return c.json(await getTrainingSignals(createDatabase(c.env.DB), c.get('user').id, new Date()));
  })

  /** La semana en curso, día a día. Tampoco lleva parámetros: la semana es la de hoy. */
  .get('/stats/week', async (c) => {
    return c.json(await getWeeklyCalendar(createDatabase(c.env.DB), c.get('user').id, new Date()));
  });
