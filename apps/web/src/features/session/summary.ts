import {
  sessionVolumeGrams,
  toProgressionSet,
  type ResourceId,
  type SetEntry,
  type TrackedExercise,
} from '@gymbuddy/shared';

export interface SessionExerciseGroup {
  readonly trackedExerciseId: ResourceId;
  readonly name: string;
  readonly sets: readonly SetEntry[];
}

/**
 * Nombre de una serie cuyo ejercicio no está en el listado. No debería pasar —la pantalla
 * pide también los archivados—, pero una serie del bot registrada mientras la lista está
 * en caché llegaría antes que su ficha, y perderla de la pantalla sería peor que esto.
 */
export const UNKNOWN_EXERCISE_NAME = 'Ejercicio';

/**
 * Las series de la sesión agrupadas por ejercicio, en el orden en que se tocó cada uno y
 * conservando dentro el orden que trae el Worker (su `orderIndex`). Es lo que se lee en
 * la sesión: qué llevas hecho de cada cosa, no una lista plana de veinte filas.
 */
export function groupSetsByExercise(
  sets: readonly SetEntry[],
  exercises: readonly TrackedExercise[],
): readonly SessionExerciseGroup[] {
  const names = new Map(exercises.map((exercise) => [exercise.id, exercise.name]));
  const order: ResourceId[] = [];
  const buckets = new Map<ResourceId, SetEntry[]>();

  for (const set of sets) {
    const bucket = buckets.get(set.trackedExerciseId);
    if (bucket === undefined) {
      order.push(set.trackedExerciseId);
      buckets.set(set.trackedExerciseId, [set]);
    } else {
      bucket.push(set);
    }
  }

  return order.map((trackedExerciseId) => ({
    trackedExerciseId,
    name: names.get(trackedExerciseId) ?? UNKNOWN_EXERCISE_NAME,
    sets: buckets.get(trackedExerciseId) ?? [],
  }));
}

/** El recuento de la sesión: lo que se enseña al terminarla. */
export interface SessionTotals {
  readonly setCount: number;
  /** Sin el calentamiento: es lo que cuenta como trabajo, igual que en la progresión. */
  readonly workingSetCount: number;
  readonly exerciseCount: number;
  readonly volumeGrams: number;
}

/**
 * El volumen sale del dominio compartido (`sessionVolumeGrams`), que ya excluye el
 * calentamiento y opera en gramos enteros: aquí no se hace aritmética con pesos.
 */
export function summarizeSession(sets: readonly SetEntry[]): SessionTotals {
  const exercises = new Set(sets.map((set) => set.trackedExerciseId));

  return {
    setCount: sets.length,
    workingSetCount: sets.filter((set) => !set.isWarmup).length,
    exerciseCount: exercises.size,
    volumeGrams: sessionVolumeGrams(sets.map(toProgressionSet)),
  };
}

/**
 * Cuándo se registró la última serie, que es desde cuándo se está descansando. Se compara
 * por instante y no por texto: el bot y la PWA pueden mandar el suyo con otra zona horaria
 * y el orden lexicográfico solo coincide con el cronológico dentro de la misma.
 */
export function latestSetCompletedAt(sets: readonly SetEntry[]): string | null {
  let latest: string | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;

  for (const set of sets) {
    const time = Date.parse(set.completedAt);
    if (Number.isNaN(time)) continue;
    if (time > latestTime) {
      latest = set.completedAt;
      latestTime = time;
    }
  }

  return latest;
}
