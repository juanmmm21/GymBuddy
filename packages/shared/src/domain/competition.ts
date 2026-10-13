/**
 * Competir con amigos: la clasificación de la semana y el cara a cara por ejercicio. Todo en
 * enteros (días, series y gramos), igual que el resto del dominio, y sin saber nada de la base:
 * el Worker trae los datos de cada participante y aquí solo se ordenan y se comparan.
 */

import type { WeekDaySummary } from './week';

/**
 * Tope de rivales a la vez. La app tiene pocas cuentas, y cada rival es una lectura más de su
 * semana en cada consulta: el tope es lo que mantiene la clasificación dentro del plan gratuito.
 */
export const MAX_RIVALS = 10;

/** Lo que una persona lleva hecho en la semana en curso. */
export interface WeekTotals {
  readonly daysTrained: number;
  readonly setCount: number;
  readonly volumeGrams: number;
}

/** Los siete días del calendario de una persona, sumados. */
export function weekTotals(days: readonly WeekDaySummary[]): WeekTotals {
  let daysTrained = 0;
  let setCount = 0;
  let volumeGrams = 0;

  for (const day of days) {
    if (day.trained) daysTrained += 1;
    setCount += day.setCount;
    volumeGrams += day.volumeGrams;
  }

  return { daysTrained, setCount, volumeGrams };
}

/**
 * La clasificación de la semana. Gana quien más días ha entrenado; si empatan, quien más series
 * efectivas lleva, y solo al final el volumen. Los kilos van los últimos a propósito: premian
 * siempre al más pesado y al día de pierna, y aquí se compite por constancia.
 *
 * Quien empata en las tres cosas comparte puesto y el siguiente se lo salta (1, 1, 3). Entre
 * empatados se conserva el orden de entrada, para que la lista no baile entre dos consultas.
 */
export function rankWeekTotals<T extends WeekTotals>(
  entries: readonly T[],
): (T & { readonly rank: number })[] {
  const sorted = entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => compareWeekTotals(a.entry, b.entry) || a.index - b.index);

  let rank = 0;
  let previous: T | undefined;

  return sorted.map(({ entry }, position) => {
    if (previous === undefined || compareWeekTotals(previous, entry) !== 0) rank = position + 1;
    previous = entry;

    return { ...entry, rank };
  });
}

/** Negativo si `a` va por delante de `b`. */
function compareWeekTotals(a: WeekTotals, b: WeekTotals): number {
  if (a.daysTrained !== b.daysTrained) return b.daysTrained - a.daysTrained;
  if (a.setCount !== b.setCount) return b.setCount - a.setCount;
  return b.volumeGrams - a.volumeGrams;
}

/** Las dos marcas vigentes de una persona en un ejercicio del catálogo. */
export interface ExerciseBest {
  readonly userId: string;
  readonly catalogId: string;
  readonly maxWeightGrams: number;
  readonly estimatedOneRepMaxGrams: number;
}

/** Un ejercicio en el que se puede comparar: quien mira y al menos un rival tienen marca. */
export interface ExerciseDuel<T extends ExerciseBest = ExerciseBest> {
  readonly catalogId: string;
  /** De mejor a peor marca. */
  readonly entries: readonly T[];
}

/**
 * Los cara a cara. Solo salen los ejercicios en los que quien mira tiene marca y algún rival
 * también: comparar dos rivales entre sí en algo que uno no hace no es su competición.
 *
 * Dentro de cada ejercicio manda el 1RM estimado —iguala un 100 × 1 con un 85 × 8, que el peso
 * máximo a secas no sabe comparar— y el peso máximo desempata. Los ejercicios salen en el orden
 * en que aparece su primera marca; el nombre lo pone quien pinta.
 */
export function exerciseDuels<T extends ExerciseBest>(
  bests: readonly T[],
  selfUserId: string,
): ExerciseDuel<T>[] {
  const byExercise = new Map<string, T[]>();

  for (const best of bests) {
    const entries = byExercise.get(best.catalogId);
    if (entries === undefined) {
      byExercise.set(best.catalogId, [best]);
    } else {
      entries.push(best);
    }
  }

  const duels: ExerciseDuel<T>[] = [];
  for (const [catalogId, entries] of byExercise) {
    const hasSelf = entries.some((entry) => entry.userId === selfUserId);
    if (!hasSelf || entries.length < 2) continue;

    duels.push({ catalogId, entries: [...entries].sort(compareExerciseBests) });
  }

  return duels;
}

function compareExerciseBests(a: ExerciseBest, b: ExerciseBest): number {
  if (a.estimatedOneRepMaxGrams !== b.estimatedOneRepMaxGrams) {
    return b.estimatedOneRepMaxGrams - a.estimatedOneRepMaxGrams;
  }
  return b.maxWeightGrams - a.maxWeightGrams;
}
