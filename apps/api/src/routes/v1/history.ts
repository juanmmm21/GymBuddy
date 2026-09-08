import { Hono } from 'hono';
import { z } from 'zod';
import { createDatabase } from '../../db/client';
import { requireUser, type AuthenticatedEnv } from '../../http/current-user';
import { parseQuery } from '../../http/query';
import { getExerciseHistory, listSessionPage } from '../../training/index';

/** Lo que cabe en una pantalla de móvil sin castigar el límite de filas leídas de D1. */
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const DEFAULT_HISTORY_SESSIONS = 10;
const MAX_HISTORY_SESSIONS = 50;

/**
 * Las fechas del filtro se normalizan a UTC antes de comparar: en la base todo está en
 * ISO UTC y una marca con otro desfase se ordenaría mal en una comparación de texto.
 */
const instantSchema = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());

const sessionPageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
  from: instantSchema.optional(),
  to: instantSchema.optional(),
});

const exerciseHistoryQuerySchema = z.object({
  sessions: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_HISTORY_SESSIONS)
    .default(DEFAULT_HISTORY_SESSIONS),
});

export const historyRoute = new Hono<AuthenticatedEnv>()
  .use('/history/*', requireUser)

  .get('/history/sessions', async (c) => {
    const { limit, offset, from, to } = parseQuery(c, sessionPageQuerySchema);

    return c.json(
      await listSessionPage(createDatabase(c.env.DB), c.get('user').id, {
        limit,
        offset,
        from,
        to,
      }),
    );
  })

  .get('/history/exercises/:id', async (c) => {
    const { sessions } = parseQuery(c, exerciseHistoryQuerySchema);

    return c.json(
      await getExerciseHistory(
        createDatabase(c.env.DB),
        c.get('user').id,
        c.req.param('id'),
        sessions,
      ),
    );
  });
