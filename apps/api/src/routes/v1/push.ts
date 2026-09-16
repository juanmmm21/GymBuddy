import {
  deletePushSubscriptionRequestSchema,
  pushSubscriptionSchema,
  restNoticeRequestSchema,
  type PushConfig,
} from '@gymbuddy/shared';
import { Hono } from 'hono';
import { createDatabase } from '../../db/client';
import { requireUser, type AuthenticatedEnv } from '../../http/current-user';
import { parseJsonBody } from '../../http/query';
import { cancelRestNotice, scheduleRestNotice } from '../../push/rest-notice';
import {
  deletePushSubscription,
  readVapidPublicKey,
  savePushSubscription,
} from '../../push/subscriptions';

/**
 * El aviso de descanso con la app cerrada, lado de la suscripción (ADR 0009). Todo cuelga de una
 * sesión: una suscripción sin cuenta no tendría descansos que avisar.
 */
export const pushRoute = new Hono<AuthenticatedEnv>()
  .use('/push/*', requireUser)

  /** La clave con la que suscribirse, o `null` si este despliegue no puede mandar avisos. */
  .get('/push/config', (c) => {
    const config: PushConfig = { publicKey: readVapidPublicKey(c.env) };

    return c.json(config);
  })

  /** 204 también al repetirla: el navegador la manda cada vez que se enciende el aviso. */
  .put('/push/subscription', async (c) => {
    const subscription = await parseJsonBody(c, pushSubscriptionSchema);
    await savePushSubscription(
      createDatabase(c.env.DB),
      c.get('user').id,
      subscription,
      new Date(),
    );

    return c.body(null, 204);
  })

  .delete('/push/subscription', async (c) => {
    const { endpoint } = await parseJsonBody(c, deletePushSubscriptionRequestSchema);
    await deletePushSubscription(createDatabase(c.env.DB), c.get('user').id, endpoint);

    return c.body(null, 204);
  })

  /**
   * Programa el aviso de fin de descanso, o lo reprograma si ya había uno. 204 también cuando no se
   * programa nada porque el descanso ya acabó o el servidor no tiene claves: la PWA no tiene nada
   * distinto que hacer en esos casos.
   */
  .put('/push/rest-notice', async (c) => {
    const request = await parseJsonBody(c, restNoticeRequestSchema);
    await scheduleRestNotice(
      createDatabase(c.env.DB),
      c.env,
      c.get('user').id,
      request,
      new Date(),
    );

    return c.body(null, 204);
  })

  /** Quita el aviso pendiente. Idempotente: sin nada programado, 204 igual. */
  .delete('/push/rest-notice', async (c) => {
    await cancelRestNotice(c.env, c.get('user').id);

    return c.body(null, 204);
  });
