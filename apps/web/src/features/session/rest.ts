import { elapsedSecondsSince } from '../../lib/time';

/** Los descansos que se usan de verdad: un minuto para aislamiento, tres para un básico. */
export const REST_TARGETS_SECONDS = [60, 90, 120, 180] as const;
export type RestTargetSeconds = (typeof REST_TARGETS_SECONDS)[number];
export const DEFAULT_REST_TARGET_SECONDS: RestTargetSeconds = 120;

export interface RestState {
  readonly elapsedSeconds: number;
  /** Lo que falta para el objetivo; cero una vez cumplido, nunca negativo. */
  readonly remainingSeconds: number;
  /** Entre 0 y 1: lo que lleva del objetivo, para pintar la barra. */
  readonly progress: number;
  readonly done: boolean;
}

/**
 * Cuánto llevas descansando. Se deriva del momento de la última serie y no de un estado
 * que arranque al pulsar: así el descanso sigue contando aunque se recargue la app o se
 * llegue desde otra pantalla, que es justo lo que pasa entre serie y serie.
 */
export function restStateAt(
  lastSetAt: string,
  now: number,
  targetSeconds: RestTargetSeconds,
): RestState {
  const elapsedSeconds = elapsedSecondsSince(lastSetAt, now);
  const remainingSeconds = Math.max(0, targetSeconds - elapsedSeconds);

  return {
    elapsedSeconds,
    remainingSeconds,
    progress: Math.min(1, elapsedSeconds / targetSeconds),
    done: elapsedSeconds >= targetSeconds,
  };
}
