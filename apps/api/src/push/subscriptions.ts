import type { PushSubscriptionRequest } from '@gymbuddy/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { pushSubscription, type PushSubscriptionRow } from '../db/schema';
import { readVapidKeys } from './web-push';

/**
 * Cuántos navegadores de una cuenta reciben el aviso. Un móvil que reinstala la app o borra sus
 * datos se suscribe con un endpoint nuevo y el viejo no avisa de que ha muerto: sin tope, las filas
 * muertas crecerían para siempre. Diez sobran para una persona con varios móviles.
 */
export const MAX_PUSH_SUBSCRIPTIONS_PER_USER = 10;

/**
 * La clave pública VAPID si el servidor puede firmar avisos, o `null`. Exige las dos mitades: con
 * solo la pública, el navegador se suscribiría a unos avisos que nadie podría mandar.
 */
export function readVapidPublicKey(env: Env): string | null {
  return readVapidKeys(env)?.publicKey ?? null;
}

/** Las suscripciones vivas de una cuenta: a todas se les manda el aviso. */
export async function listPushSubscriptions(
  db: Database,
  userId: string,
): Promise<readonly PushSubscriptionRow[]> {
  return db.select().from(pushSubscription).where(eq(pushSubscription.userId, userId));
}

/**
 * Guarda la suscripción de este navegador para la cuenta de la sesión. Si el endpoint ya estaba,
 * se pisa —también si era de otra cuenta: el navegador es ahora de quien ha entrado— y, en el mismo
 * lote, se retiran las más viejas de la cuenta por encima del tope.
 */
export async function savePushSubscription(
  db: Database,
  userId: string,
  subscription: PushSubscriptionRequest,
  now: Date,
): Promise<void> {
  const saved = {
    userId,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    subscribedAt: now.toISOString(),
  };

  await db.batch([
    db
      .insert(pushSubscription)
      .values({ endpoint: subscription.endpoint, ...saved })
      .onConflictDoUpdate({ target: pushSubscription.endpoint, set: saved }),
    db.delete(pushSubscription).where(
      and(
        eq(pushSubscription.userId, userId),
        sql`${pushSubscription.endpoint} not in (
            select ${pushSubscription.endpoint} from ${pushSubscription}
            where ${pushSubscription.userId} = ${userId}
            order by ${pushSubscription.subscribedAt} desc, ${pushSubscription.endpoint} desc
            limit ${MAX_PUSH_SUBSCRIPTIONS_PER_USER}
          )`,
      ),
    ),
  ]);
}

/**
 * Retira la suscripción de este navegador. Solo la de la cuenta de la sesión: conocer el endpoint
 * de otro no basta para dejarle sin avisos. Idempotente: si no estaba, no pasa nada.
 */
export async function deletePushSubscription(
  db: Database,
  userId: string,
  endpoint: string,
): Promise<void> {
  await db
    .delete(pushSubscription)
    .where(and(eq(pushSubscription.endpoint, endpoint), eq(pushSubscription.userId, userId)));
}
