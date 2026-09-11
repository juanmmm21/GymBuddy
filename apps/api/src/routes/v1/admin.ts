import type { Invitation } from '@gymbuddy/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { issueInvitation } from '../../auth/invitations';
import { CatalogSourceError } from '../../catalog/client';
import {
  readCatalogSyncStatus,
  recordCatalogSyncFailure,
  runCatalogSyncStep,
} from '../../catalog/index';
import { createDatabase } from '../../db/client';
import { ApiException } from '../../http/errors';
import { parseQuery } from '../../http/query';
import { readSecret } from '../../http/env';
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
    await assertAdmin(c.req.header(ADMIN_TOKEN_HEADER), readSecret(c.env, 'ADMIN_TOKEN'));

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
    await assertAdmin(c.req.header(ADMIN_TOKEN_HEADER), readSecret(c.env, 'ADMIN_TOKEN'));

    const status = await readCatalogSyncStatus(createDatabase(c.env.DB));
    if (status === null) {
      throw new ApiException('not_found', 'El catálogo no se ha sincronizado todavía');
    }

    return c.json(status);
  })

  /**
   * Crea una invitación para registrarse. Es como entra la primera cuenta, que no tiene a
   * nadie que la invite. El código solo viaja en esta respuesta: en la base queda su digest.
   */
  .post('/admin/invitations', async (c) => {
    await assertAdmin(c.req.header(ADMIN_TOKEN_HEADER), readSecret(c.env, 'ADMIN_TOKEN'));

    const created: Invitation = await issueInvitation(createDatabase(c.env.DB), {
      createdByUserId: null,
      now: new Date(),
    });

    return c.json(created, 201);
  });

/**
 * Protege las rutas de administración con un secreto propio. Sin él configurado responden
 * `not_found`: dejar abiertas la sincronización o las invitaciones permitiría que cualquiera
 * consumiese las 100.000 escrituras diarias de D1, y un olvido de configuración no puede abrir
 * el agujero.
 * Los usuarios no tienen roles: administrar es de quien tiene este secreto.
 */
async function assertAdmin(
  provided: string | undefined,
  expected: string | undefined,
): Promise<void> {
  const notFound = new ApiException('not_found', 'No existe la ruta solicitada');

  if (expected === undefined) throw notFound;
  if (provided === undefined) throw notFound;
  if (!(await constantTimeEquals(provided, expected))) throw notFound;
}
