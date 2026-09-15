import {
  parseKilogramsToGrams,
  type CardioSetEntry,
  type SetEntry,
  type SetKind,
  type StrengthSetEntry,
  type TrackedExercise,
  type WeightKilograms,
} from '@gymbuddy/shared';
import type { CardioSetValues, SetValues } from './SetFields';

/** De dónde sale lo que se propone, para decirlo bajo el peso. */
export type SetProposalSource = 'session' | 'last_time' | 'none';

export interface SetProposal {
  readonly values: SetValues;
  readonly source: SetProposalSource;
}

export interface CardioSetProposal {
  readonly values: CardioSetValues;
  readonly source: SetProposalSource;
}

/**
 * Lo que se precarga al registrar una serie: **el peso y las repeticiones de la última serie de ese
 * ejercicio**, sin sumar nada. Juan lo pidió tras entrenar con la app: el peso habitual (una mediana)
 * le proponía cifras que no había levantado la última vez, y subir tiene que ser decisión suya.
 *
 * Primero manda la sesión en curso —con lo que espera en la cola, que ya viene aplicado en
 * `sessionSets`—; si hoy todavía no lo ha hecho, la última vez que lo hizo. El calentamiento no
 * cuenta: proponer el peso de calentar para la serie de trabajo sería proponer de menos. Una serie
 * de cardio tampoco: no tiene peso que proponer.
 */
export function proposeSet(
  exercise: TrackedExercise,
  sessionSets: readonly SetEntry[],
): SetProposal {
  const today = latestEffectiveSet(sessionSets, exercise.id, isStrengthSet);
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

/**
 * Lo que se precarga al registrar cardio: la duración y la distancia de la última serie de cardio de
 * ese ejercicio, con la misma regla que la fuerza (hoy primero, luego la última vez, sin calentar).
 */
export function proposeCardioSet(
  exercise: TrackedExercise,
  sessionSets: readonly SetEntry[],
): CardioSetProposal {
  const today = latestEffectiveSet(sessionSets, exercise.id, isCardioSet);
  if (today !== null) {
    return {
      values: cardioValuesOf(today.durationSeconds, today.distanceMeters),
      source: 'session',
    };
  }

  if (exercise.lastCardioSet !== null) {
    return {
      values: cardioValuesOf(
        exercise.lastCardioSet.durationSeconds,
        exercise.lastCardioSet.distanceMeters,
      ),
      source: 'last_time',
    };
  }

  return {
    values: { durationSeconds: null, distanceMeters: null, rpe: null, isWarmup: false },
    source: 'none',
  };
}

/**
 * Qué mide la serie de un ejercicio: cardio si el ejercicio es de la parte «cardio» y fuerza en
 * cualquier otro. Lo pidió Juan tras probarlo: elegir el tipo en cada serie no tenía sentido, el
 * ejercicio ya lo dice. Un ejercicio propio sin parte del cuerpo se registra como fuerza.
 */
export function setKindFor(exercise: TrackedExercise): SetKind {
  return exercise.bodyPart === 'cardio' ? 'cardio' : 'strength';
}

/** La frase bajo la duración: de dónde sale lo propuesto. */
export function describeCardioProposal(source: SetProposalSource): string {
  switch (source) {
    case 'session':
      return 'Lo mismo que tu último cardio de hoy en este ejercicio.';
    case 'last_time':
      return 'Lo mismo que la última vez. En minutos, o minutos y segundos: 25:30.';
    case 'none':
      return 'En minutos, o minutos y segundos: 25:30.';
  }
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

function cardioValuesOf(durationSeconds: number, distanceMeters: number | null): CardioSetValues {
  return { durationSeconds, distanceMeters, rpe: null, isWarmup: false };
}

function isStrengthSet(set: SetEntry): set is StrengthSetEntry {
  return set.kind === 'strength';
}

function isCardioSet(set: SetEntry): set is CardioSetEntry {
  return set.kind === 'cardio';
}

/** La última serie efectiva (sin calentar) de un tipo y un ejercicio en la sesión. */
function latestEffectiveSet<T extends SetEntry>(
  sets: readonly SetEntry[],
  exerciseId: string,
  isKind: (set: SetEntry) => set is T,
): T | null {
  const latest = latestSetOf(sets, exerciseId, (set) => isKind(set) && !set.isWarmup);

  return latest !== null && isKind(latest) ? latest : null;
}

/** La última serie de ese ejercicio en la sesión que cumpla la condición, comparando horas como instantes. */
function latestSetOf(
  sets: readonly SetEntry[],
  exerciseId: string,
  accepts: (set: SetEntry) => boolean,
): SetEntry | null {
  let latest: SetEntry | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;

  for (const set of sets) {
    if (set.trackedExerciseId !== exerciseId || !accepts(set)) continue;
    const time = Date.parse(set.completedAt);
    if (Number.isNaN(time) || time < latestTime) continue;
    latest = set;
    latestTime = time;
  }

  return latest;
}
