import {
  parseKilogramsToGrams,
  type SetEntry,
  type TrackedExercise,
  type WeightKilograms,
} from '@gymbuddy/shared';
import type { SetValues } from './SetFields';

/** De dónde sale lo que se propone, para decirlo bajo el peso. */
export type SetProposalSource = 'session' | 'last_time' | 'none';

export interface SetProposal {
  readonly values: SetValues;
  readonly source: SetProposalSource;
}

/**
 * Lo que se precarga al registrar una serie: **el peso y las repeticiones de la última serie de ese
 * ejercicio**, sin sumar nada. Juan lo pidió tras entrenar con la app: el peso habitual (una mediana)
 * le proponía cifras que no había levantado la última vez, y subir tiene que ser decisión suya.
 *
 * Primero manda la sesión en curso —con lo que espera en la cola, que ya viene aplicado en
 * `sessionSets`—; si hoy todavía no lo ha hecho, la última vez que lo hizo. El calentamiento no
 * cuenta: proponer el peso de calentar para la serie de trabajo sería proponer de menos.
 */
export function proposeSet(
  exercise: TrackedExercise,
  sessionSets: readonly SetEntry[],
): SetProposal {
  const today = latestEffectiveSet(sessionSets, exercise.id);
  if (today !== null) return { values: valuesOf(today.weight, today.reps), source: 'session' };

  if (exercise.lastSet !== null) {
    return {
      values: valuesOf(exercise.lastSet.weight, exercise.lastSet.reps),
      source: 'last_time',
    };
  }

  return {
    values: { weightGrams: null, reps: null, rpe: null, isWarmup: false },
    source: 'none',
  };
}

/** La frase bajo el peso: de dónde sale lo propuesto. */
export function describeProposal(source: SetProposalSource): string {
  switch (source) {
    case 'session':
      return 'Lo mismo que tu última serie de hoy. Cámbialo si subes.';
    case 'last_time':
      return 'Lo mismo que tu última serie de este ejercicio. Cámbialo si subes.';
    case 'none':
      return 'Es tu primera serie de este ejercicio.';
  }
}

function valuesOf(weight: WeightKilograms, reps: number): SetValues {
  // Del contrato al campo sin pasar por `Number`: el peso es entero de gramos.
  return { weightGrams: parseKilogramsToGrams(weight), reps, rpe: null, isWarmup: false };
}

/** La última serie efectiva de ese ejercicio en la sesión, comparando horas como instantes. */
function latestEffectiveSet(sets: readonly SetEntry[], exerciseId: string): SetEntry | null {
  let latest: SetEntry | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;

  for (const set of sets) {
    if (set.trackedExerciseId !== exerciseId || set.isWarmup) continue;
    const time = Date.parse(set.completedAt);
    if (Number.isNaN(time) || time < latestTime) continue;
    latest = set;
    latestTime = time;
  }

  return latest;
}
