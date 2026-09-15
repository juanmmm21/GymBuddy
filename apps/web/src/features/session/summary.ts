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
  /** El del catálogo, o nulo en uno propio o en uno que no está en el listado. */
  readonly equipment: string | null;
  readonly sets: readonly SetEntry[];
}

/**
 * Nombre de una serie cuyo ejercicio no está en el listado. No debería pasar —la pantalla
 * pide también los archivados—, pero una serie escrita desde otro móvil mientras la lista
 * está en caché llegaría antes que su ficha, y perderla de la pantalla sería peor que esto.
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
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
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
    name: byId.get(trackedExerciseId)?.name ?? UNKNOWN_EXERCISE_NAME,
    equipment: byId.get(trackedExerciseId)?.equipment ?? null,
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
 * calentamiento y opera en gramos enteros: aquí no se hace aritmética con pesos. El cardio
 * cuenta como serie pero no suma volumen: no mueve gramos.
 *
 * Los ejercicios hacen falta para saber cuáles son a un brazo, que cuentan los dos lados. Uno que
 * no esté en la lista cuenta un lado: sin su ficha no se puede saber más.
 */
export function summarizeSession(
  sets: readonly SetEntry[],
  exercises: readonly Pick<TrackedExercise, 'id' | 'unilateral'>[],
): SessionTotals {
  const exerciseIds = new Set(sets.map((set) => set.trackedExerciseId));
  const unilateralIds = new Set(
    exercises.flatMap((exercise) => (exercise.unilateral ? [exercise.id] : [])),
  );

  return {
    setCount: sets.length,
    workingSetCount: sets.filter((set) => !set.isWarmup).length,
    exerciseCount: exerciseIds.size,
    volumeGrams: sessionVolumeGrams(
      sets.flatMap((set) =>
        set.kind === 'strength'
          ? [toProgressionSet(set, unilateralIds.has(set.trackedExerciseId))]
          : [],
      ),
    ),
  };
}

/**
 * La serie más reciente por hora. Se compara por instante y no por texto: dos móviles de la
 * misma cuenta pueden mandar el suyo con otra zona horaria, y el orden lexicográfico solo
 * coincide con el cronológico en una. Con la cola offline encima pueden llegar desordenadas;
 * a igual hora gana la que va después en la lista.
 */
export function latestSet(sets: readonly SetEntry[]): SetEntry | null {
  let latest: SetEntry | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;

  for (const set of sets) {
    const time = Date.parse(set.completedAt);
    if (Number.isNaN(time) || time < latestTime) continue;
    latest = set;
    latestTime = time;
  }

  return latest;
}

/** Cuándo se registró la última serie, que es desde cuándo se está descansando. */
export function latestSetCompletedAt(sets: readonly SetEntry[]): string | null {
  return latestSet(sets)?.completedAt ?? null;
}
