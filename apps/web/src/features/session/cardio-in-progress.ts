import { MAX_CARDIO_DURATION_SECONDS } from '@gymbuddy/shared';
import { elapsedSecondsSince } from '../../lib/time';

const SECONDS_PER_MINUTE = 60;

/**
 * La duración que se propone al apuntar el cardio en marcha: lo que lleva desde que se empezó,
 * **redondeado al minuto**. El móvil se mira al bajarse de la máquina, no en el segundo exacto en
 * que paró, así que los segundos serían precisión falsa; y «25» se corrige más rápido que «25:47».
 * Nunca menos de un minuto —el contrato no admite cero— ni más de lo que admite una serie.
 */
export function cardioDurationSoFar(cardioStartedAt: string, now: number): number {
  const minutes = Math.round(elapsedSecondsSince(cardioStartedAt, now) / SECONDS_PER_MINUTE);

  return Math.min(Math.max(minutes, 1) * SECONDS_PER_MINUTE, MAX_CARDIO_DURATION_SECONDS);
}
