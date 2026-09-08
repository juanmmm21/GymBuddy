import { Hono } from 'hono';
import { z } from 'zod';
import { CatalogSourceError } from '../../catalog/client';
import {
  readCatalogSyncStatus,
  recordCatalogSyncFailure,
  runCatalogSyncStep,
} from '../../catalog/index';
import { createDatabase } from '../../db/client';
import { ApiException } from '../../http/errors';
import { parseQuery } from '../../http/query';
import { constantTimeEquals } from '../../http/secrets';

const ADMIN_TOKEN_HEADER = 'x-gymbuddy-admin-token';

const syncQuerySchema = z.object({
  // Rearranca el ciclo desde el primer músculo. Se usa en desarrollo; en producción el
  // ciclo se reinicia solo al cambiar el tag del catálogo.
  force: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export const adminRoute = new Hono<{ Bindings: Env }>()
  /**
   * Dispara un paso de la sincronización a mano. Cada llamada avanza un músculo, igual que
   * el Cron Trigger: son la misma función, no dos caminos que puedan desincronizarse.
   */
  .post('/admin/catalog/sync', async (c) => {
    await assertAdmin(c.req.header(ADMIN_TOKEN_HEADER), c.env.ADMIN_TOKEN);

    const { force } = parseQuery(c, syncQuerySchema);
    const db = createDatabase(c.env.DB);

    try {
      return c.json(await runCatalogSyncStep(db, { force }));
    } catch (error) {
      if (error instanceof CatalogSourceError) {
        await recordCatalogSyncFailure(db, error.message);
        throw new ApiException('catalog_unavailable', error.message, { url: error.url });
      }

      throw error;
    }
  })

  .get('/admin/catalog/status', async (c) => {
    await assertAdmin(c.req.header(ADMIN_TOKEN_HEADER), c.env.ADMIN_TOKEN);

    const status = await readCatalogSyncStatus(createDatabase(c.env.DB));
    if (status === null) {
      throw new ApiException('not_found', 'El catálogo no se ha sincronizado todavía');
    }

    return c.json(status);
  });

/**
 * Protege las rutas de administración con un secreto propio. Sin él configurado responden
 * `not_found`: dejar abierta la sincronización permitiría que cualquiera consumiese las
 * 100.000 escrituras diarias de D1, y un olvido de configuración no puede abrir el agujero.
 * Cuando llegue la identidad de Telegram (fase 4) esto pasará a ser el rol del usuario.
 */
async function assertAdmin(
  provided: string | undefined,
  expected: string | undefined,
): Promise<void> {
  const notFound = new ApiException('not_found', 'No existe la ruta solicitada');

  if (expected === undefined || expected === '') throw notFound;
  if (provided === undefined) throw notFound;
  if (!(await constantTimeEquals(provided, expected))) throw notFound;
}
