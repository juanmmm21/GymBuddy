/**
 * Competir con amigos: el cara a cara por peso en los ejercicios del catálogo que se comparten.
 * Se compite solo por el peso máximo levantado (lo decidió Juan el 2026-10-14: «no competimos por
 * días, solo por peso»). Todo en gramos enteros, sin saber nada de la base: el Worker trae las
 * marcas de cada participante y aquí solo se ordenan y se cuentan.
 */

/**
 * Tope de rivales a la vez. La app tiene pocas cuentas, y cada rival suma sus marcas a la consulta:
 * el tope es lo que mantiene la competición dentro del plan gratuito.
 */
export const MAX_RIVALS = 10;

/** El peso máximo vigente de una persona en un ejercicio del catálogo. */
export interface ExerciseBest {
  readonly userId: string;
  readonly catalogId: string;
  readonly maxWeightGrams: number;
}

/** Un ejercicio en el que se puede comparar: quien mira y al menos un rival tienen marca. */
export interface ExerciseDuel<T extends ExerciseBest = ExerciseBest> {
  readonly catalogId: string;
  /** Del más pesado al más ligero. */
  readonly entries: readonly T[];
}

/**
 * Los cara a cara. Solo salen los ejercicios en los que quien mira tiene marca y algún rival
 * también: comparar dos rivales entre sí en algo que uno no hace no es su competición. Dentro de
 * cada uno se ordena por peso máximo; entre empatados se conserva el orden de entrada.
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

    duels.push({
      catalogId,
      entries: [...entries].sort((a, b) => b.maxWeightGrams - a.maxWeightGrams),
    });
  }

  return duels;
}
