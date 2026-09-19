import { elapsedSecondsSince } from '../../lib/time';

/**
 * Qué descanso toca: entre dos series del mismo ejercicio, o para cambiar de ejercicio (buscar la
 * máquina, cargarla, esperar a que quede libre). Lo pidió Juan tras entrenar con la app; el de cambio
 * se aplica solo cuando la rutina pasa a otro ejercicio (ver `restKindAfter`).
 */
export type RestKind = 'set' | 'exercise';

/** Los descansos entre series que se usan de verdad: un minuto para aislamiento, tres para un básico. */
export const SET_REST_TARGETS_SECONDS = [60, 90, 120, 180] as const;
export type SetRestSeconds = (typeof SET_REST_TARGETS_SECONDS)[number];

/** Cambiar de ejercicio lleva más: de dos a cinco minutos. */
export const EXERCISE_REST_TARGETS_SECONDS = [120, 180, 240, 300] as const;
export type ExerciseRestSeconds = (typeof EXERCISE_REST_TARGETS_SECONDS)[number];

/** Los dos objetivos que se eligen y se recuerdan en el dispositivo hasta cambiarlos. */
export interface RestPreferences {
  readonly setSeconds: SetRestSeconds;
  readonly exerciseSeconds: ExerciseRestSeconds;
}

export const DEFAULT_REST_PREFERENCES: RestPreferences = { setSeconds: 120, exerciseSeconds: 180 };

/** Las opciones que se ofrecen para un tipo de descanso. */
export function restTargetsFor(kind: RestKind): readonly number[] {
  return kind === 'set' ? SET_REST_TARGETS_SECONDS : EXERCISE_REST_TARGETS_SECONDS;
}

/** El objetivo vigente para un tipo de descanso. */
export function restTargetFor(preferences: RestPreferences, kind: RestKind): number {
  return kind === 'set' ? preferences.setSeconds : preferences.exerciseSeconds;
}

/**
 * Cambia el objetivo de un tipo de descanso. Un valor que no está entre sus opciones deja las
 * preferencias como estaban: la pantalla solo ofrece los válidos, y aquí no se inventa ninguno.
 */
export function withRestTarget(
  preferences: RestPreferences,
  kind: RestKind,
  seconds: number,
): RestPreferences {
  if (kind === 'set') {
    return isSetRest(seconds) ? { ...preferences, setSeconds: seconds } : preferences;
  }
  return isExerciseRest(seconds) ? { ...preferences, exerciseSeconds: seconds } : preferences;
}

export function isSetRest(seconds: number): seconds is SetRestSeconds {
  return (SET_REST_TARGETS_SECONDS as readonly number[]).includes(seconds);
}

export function isExerciseRest(seconds: number): seconds is ExerciseRestSeconds {
  return (EXERCISE_REST_TARGETS_SECONDS as readonly number[]).includes(seconds);
}

export interface RestState {
  readonly elapsedSeconds: number;
  /** Lo que falta para el objetivo; cero una vez cumplido, nunca negativo. Es lo que se enseña. */
  readonly remainingSeconds: number;
  /**
   * Entre 1 y 0: lo que queda del objetivo. Es lo que se ve vaciarse, porque lo que importa entre
   * serie y serie es cuánto falta, no cuánto llevas.
   */
  readonly remaining: number;
  readonly done: boolean;
}

/**
 * Cuánto llevas descansando. Se deriva del momento de la última serie y no de un estado
 * que arranque al pulsar: así el descanso sigue contando aunque se recargue la app o se
 * llegue desde otra pantalla, que es justo lo que pasa entre serie y serie.
 */
export function restStateAt(lastSetAt: string, now: number, targetSeconds: number): RestState {
  const elapsedSeconds = elapsedSecondsSince(lastSetAt, now);
  const remainingSeconds = Math.max(0, targetSeconds - elapsedSeconds);

  return {
    elapsedSeconds,
    remainingSeconds,
    remaining: targetSeconds <= 0 ? 0 : remainingSeconds / targetSeconds,
    done: elapsedSeconds >= targetSeconds,
  };
}
