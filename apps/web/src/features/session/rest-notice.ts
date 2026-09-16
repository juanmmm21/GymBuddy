import type { ResourceId, RestNoticeRequest } from '@gymbuddy/shared';
import { ApiRequestError, type ApiClient } from '../../api/client';
import { cancelRestNotice, scheduleRestNotice } from '../../api/endpoints';

const MILLISECONDS_PER_SECOND = 1000;

export interface RestNoticeInput {
  readonly sessionId: ResourceId;
  /** El `completedAt` de la última serie, con la cola encima; `null` sin series. */
  readonly lastSetAt: string | null;
  /** El objetivo vigente del descanso que toca, el mismo que enseña el temporizador. */
  readonly targetSeconds: number;
  /** Con un cardio en marcha no hay descanso que avisar: el temporizador ni se pinta. */
  readonly cardioStartedAt: string | null;
  readonly now: number;
}

/**
 * El aviso que debería estar programado ahora mismo, o `null` si ninguno. Se deriva igual que el
 * temporizador de la pantalla (desde la última serie y el objetivo), así que el aviso suena cuando
 * el cronómetro llega a 0:00. Un descanso ya cumplido no se avisa: sonaría en el acto.
 */
export function restNoticeRequestFor({
  sessionId,
  lastSetAt,
  targetSeconds,
  cardioStartedAt,
  now,
}: RestNoticeInput): RestNoticeRequest | null {
  if (lastSetAt === null || cardioStartedAt !== null) return null;

  const lastSet = Date.parse(lastSetAt);
  if (Number.isNaN(lastSet)) return null;

  const endsAt = lastSet + targetSeconds * MILLISECONDS_PER_SECOND;
  if (endsAt <= now) return null;

  return { sessionId, endsAt: new Date(endsAt).toISOString() };
}

/** Dos avisos son el mismo si acaban a la vez en la misma sesión: repetirlo no cambia nada. */
export function restNoticeKey(request: RestNoticeRequest | null): string | null {
  return request === null ? null : `${request.sessionId}@${request.endsAt}`;
}

/**
 * Pide el aviso al Worker. Va directo y fuera de la cola offline: encolado llegaría cuando el
 * descanso ya pasó. Nunca lanza, porque un aviso que no se programa no puede estorbar el registro
 * de la serie: sin red solo se registra, y una sesión que el Worker ya no ve abierta (se cerró
 * desde otro móvil) o que aún no conoce (su alta espera en la cola) tampoco tiene nada que avisar.
 */
export async function requestRestNotice(
  client: ApiClient,
  request: RestNoticeRequest,
): Promise<void> {
  try {
    await scheduleRestNotice(client, request);
  } catch (error) {
    if (isExpectedRefusal(error)) return;
    console.warn('No se pudo programar el aviso de fin de descanso', error);
  }
}

/** Quita el aviso pendiente. Nunca lanza, por lo mismo que `requestRestNotice`. */
export async function withdrawRestNotice(client: ApiClient): Promise<void> {
  try {
    await cancelRestNotice(client);
  } catch (error) {
    // Sin red el aviso puede sonar igual; si la sesión ya se cerró en el Worker, la alarma no manda nada.
    console.warn('No se pudo quitar el aviso de fin de descanso', error);
  }
}

function isExpectedRefusal(error: unknown): boolean {
  return (
    error instanceof ApiRequestError &&
    (error.code === 'session_closed' || error.code === 'not_found')
  );
}
