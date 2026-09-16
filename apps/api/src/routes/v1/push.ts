import {
  deletePushSubscriptionRequestSchema,
  pushSubscriptionSchema,
  type PushConfig,
} from '@gymbuddy/shared';
import { Hono } from 'hono';
import { createDatabase } from '../../db/client';
import { requireUser, type AuthenticatedEnv } from '../../http/current-user';
import { parseJsonBody } from '../../http/query';
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
  });
