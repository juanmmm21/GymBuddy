import { MAX_REST_NOTICE_DELAY_SECONDS, type RestNoticeRequest } from '@gymbuddy/shared';
import type { Database } from '../db/client';
import { ApiException } from '../http/errors';
import { findSessionOpenState, sessionNotFound } from '../training/index';
import type { RestNoticeAlarm } from './rest-notice-alarm';
import { deletePushSubscription, listPushSubscriptions } from './subscriptions';
import { readVapidKeys, sendEmptyPush, type PushDelivery } from './web-push';

/**
 * Lo que guarda la alarma de una cuenta: de quién es (el id del Durable Object sale del usuario y no
 * se puede deshacer), de qué sesión y cuándo acaba el descanso.
 */
export interface ScheduledRestNotice {
  readonly userId: string;
  readonly sessionId: string;
  readonly endsAt: string;
}

/**
 * El servicio de push guarda el aviso un minuto como mucho si el móvil no está localizable. Pasado
 * eso, «se acabó el descanso» ya no es verdad útil: sonaría con la siguiente serie a medias.
 */
export const REST_NOTICE_TTL_SECONDS = 60;

/** Qué pasó al disparar la alarma, para los logs y los tests. */
export type RestNoticeOutcome =
  | {
      readonly kind: 'sent';
      readonly delivered: number;
      readonly gone: number;
      readonly failed: number;
    }
  | { readonly kind: 'skipped'; readonly reason: RestNoticeSkipReason };

export type RestNoticeSkipReason = 'no_keys' | 'late' | 'session_not_open' | 'no_subscriptions';

export interface DeliverRestNoticeOptions {
  readonly now: Date;
  readonly fetchImpl: typeof fetch;
}

/** Qué hizo la petición de programar: la ruta responde 204 igual, los tests miran el detalle. */
export type RestNoticeScheduling = 'scheduled' | 'cancelled' | 'no_keys';

/** La alarma de la cuenta: el mismo Durable Object para el mismo usuario, desde cualquier móvil. */
function alarmFor(env: Env, userId: string): DurableObjectStub<RestNoticeAlarm> {
  return env.REST_NOTICE.get(env.REST_NOTICE.idFromName(userId));
}

/**
 * Programa el aviso de fin de descanso de la cuenta, pisando el que hubiera. La sesión tiene que ser
 * de quien pide y seguir abierta. Un fin que ya pasó quita el aviso pendiente en vez de fallar: es
 * lo que pasa cuando la petición sale tarde por la cobertura, y avisar ya no serviría.
 */
export async function scheduleRestNotice(
  db: Database,
  env: Env,
  userId: string,
  request: RestNoticeRequest,
  now: Date,
): Promise<RestNoticeScheduling> {
  const state = await findSessionOpenState(db, userId, request.sessionId);
  if (state === 'missing') throw sessionNotFound(request.sessionId);
  if (state === 'closed') {
    throw new ApiException('session_closed', 'Esa sesión ya está cerrada', {
      sessionId: request.sessionId,
    });
  }

  const delayMs = Date.parse(request.endsAt) - now.getTime();
  if (delayMs > MAX_REST_NOTICE_DELAY_SECONDS * 1000) {
    throw new ApiException('validation_failed', 'El descanso no puede acabar tan tarde', {
      endsAt: request.endsAt,
      maxDelaySeconds: MAX_REST_NOTICE_DELAY_SECONDS,
    });
  }

  // Sin claves no se podría firmar el aviso: no se gasta ni la escritura de la alarma.
  if (readVapidKeys(env) === null) return 'no_keys';

  if (delayMs <= 0) {
    await cancelRestNotice(env, userId);
    return 'cancelled';
  }

  await alarmFor(env, userId).schedule({
    userId,
    sessionId: request.sessionId,
    endsAt: new Date(Date.parse(request.endsAt)).toISOString(),
  });
  return 'scheduled';
}

/** Quita el aviso pendiente de la cuenta: se registró la siguiente serie o se terminó. */
export async function cancelRestNotice(env: Env, userId: string): Promise<void> {
  await alarmFor(env, userId).cancel();
}

/**
 * Manda el aviso de fin de descanso a todos los navegadores suscritos de la cuenta. No se manda si
 * la sesión ya no está abierta —se terminó en otro móvil o se borró— ni si la alarma llega tan tarde
 * que el aviso ya no serviría. Las suscripciones que el servicio da por muertas se retiran.
 */
export async function deliverRestNotice(
  db: Database,
  env: Env,
  notice: ScheduledRestNotice,
  { now, fetchImpl }: DeliverRestNoticeOptions,
): Promise<RestNoticeOutcome> {
  const keys = readVapidKeys(env);
  if (keys === null) return { kind: 'skipped', reason: 'no_keys' };

  if (now.getTime() - Date.parse(notice.endsAt) > REST_NOTICE_TTL_SECONDS * 1000) {
    return { kind: 'skipped', reason: 'late' };
  }

  const state = await findSessionOpenState(db, notice.userId, notice.sessionId);
  if (state !== 'open') return { kind: 'skipped', reason: 'session_not_open' };

  const subscriptions = await listPushSubscriptions(db, notice.userId);
  if (subscriptions.length === 0) return { kind: 'skipped', reason: 'no_subscriptions' };

  const deliveries = await Promise.all(
    subscriptions.map(async (subscription): Promise<PushDelivery> => {
      const delivery = await sendEmptyPush(subscription, {
        keys,
        subject: env.WEBAUTHN_ORIGIN,
        ttlSeconds: REST_NOTICE_TTL_SECONDS,
        now,
        fetchImpl,
      });
      if (delivery === 'gone') {
        await deletePushSubscription(db, notice.userId, subscription.endpoint);
      }
      return delivery;
    }),
  );

  const count = (wanted: PushDelivery): number =>
    deliveries.filter((delivery) => delivery === wanted).length;

  return {
    kind: 'sent',
    delivered: count('delivered'),
    gone: count('gone'),
    failed: count('failed'),
  };
}
