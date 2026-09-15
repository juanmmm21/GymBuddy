import type { SetEntry, TrackedExercise, WorkoutSessionDetail } from '@gymbuddy/shared';
import { UNKNOWN_EXERCISE_NAME, summarizeSession } from '../session/summary';

/** La última serie de la sesión, con lo que hace falta para pintarla en Hoy. */
export interface LiveLastSet {
  readonly exerciseName: string;
  readonly equipment: string | null;
  /** La serie tal cual: de fuerza lleva peso y repeticiones, de cardio su duración. */
  readonly set: SetEntry;
}

/** Lo que resume la tarjeta de la sesión en curso. */
export interface LiveSessionSummary {
  readonly exerciseCount: number;
  readonly setCount: number;
  readonly volumeGrams: number;
  readonly lastSet: LiveLastSet | null;
}

/**
 * El resumen de una sesión en curso para la tarjeta de Hoy. Es puro: la tarjeta solo lo pinta. La
 * última serie es la de hora más reciente y no la última de la lista, porque la cola offline puede
 * dejar series fuera de orden. Las horas se comparan como instantes.
 */
export function summarizeLiveSession(
  session: WorkoutSessionDetail,
  exercises: readonly TrackedExercise[],
): LiveSessionSummary {
  const totals = summarizeSession(session.sets, exercises);
  let latest: WorkoutSessionDetail['sets'][number] | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;

  for (const set of session.sets) {
    const time = Date.parse(set.completedAt);
    if (Number.isNaN(time) || time < latestTime) continue;
    latest = set;
    latestTime = time;
  }

  const exercise =
    latest === null ? undefined : exercises.find((item) => item.id === latest.trackedExerciseId);

  return {
    exerciseCount: totals.exerciseCount,
    setCount: totals.setCount,
    volumeGrams: totals.volumeGrams,
    lastSet:
      latest === null
        ? null
        : {
            exerciseName: exercise?.name ?? UNKNOWN_EXERCISE_NAME,
            equipment: exercise?.equipment ?? null,
            set: latest,
          },
  };
}
