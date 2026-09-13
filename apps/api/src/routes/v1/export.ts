import { MAX_EXPORT_SESSION_PAGE_SIZE } from '@gymbuddy/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { createDatabase } from '../../db/client';
import { requireUser, type AuthenticatedEnv } from '../../http/current-user';
import { parseQuery } from '../../http/query';
import { getExportSnapshot, listExportSessionPage } from '../../training/index';

const sessionPageQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_EXPORT_SESSION_PAGE_SIZE)
    .default(MAX_EXPORT_SESSION_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * La copia de seguridad del usuario, en dos piezas que la PWA junta en un fichero: las
 * sesiones por páginas y, al final, lo demás. Solo lectura y siempre sobre el usuario del
 * contexto: no hay forma de pedir la copia de otro.
 */
export const exportRoute = new Hono<AuthenticatedEnv>()
  .use('/export/*', requireUser)

  .get('/export/sessions', async (c) => {
    const query = parseQuery(c, sessionPageQuerySchema);

    return c.json(await listExportSessionPage(createDatabase(c.env.DB), c.get('user').id, query));
  })

  .get('/export/snapshot', async (c) => {
    return c.json(await getExportSnapshot(createDatabase(c.env.DB), c.get('user'), new Date()));
  });
