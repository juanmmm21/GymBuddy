import type { ResourceId, SetEntry, TrackedExercise } from '@gymbuddy/shared';
import { latestSet } from './summary';

/**
 * Qué se ofrece al terminar: un cardio opcional para cerrar el entreno, esté o no en la rutina.
 *
 * - `exercise`: hay un ejercicio de cardio que proponer; la hoja de registro se abre con él y en cardio.
 * - `no_exercise`: apetece ofrecerlo, pero el usuario no sigue ningún ejercicio de cardio.
 * - `none`: no se ofrece (la sesión está vacía o ya termina en cardio).
 */
export type FinalCardioOffer =
  | { readonly kind: 'exercise'; readonly exerciseId: ResourceId }
  | { readonly kind: 'no_exercise' }
  | { readonly kind: 'none' };

interface Candidate {
  readonly exerciseId: ResourceId;
  readonly time: number;
}

/**
 * Decide la oferta del cardio final a partir de los ejercicios que se pueden elegir y de las series
 * de la sesión (con la cola encima).
 *
 * No se ofrece en una sesión sin series —no hay entreno que rematar, y quien solo viene a correr ya
 * lo apunta con «Registrar serie»— ni cuando la última serie ya es de cardio: ese cardio final ya
 * está hecho, y volver a ofrecerlo tras apuntarlo obligaría a rechazarlo para poder cerrar.
 */
export function finalCardioOffer(
  exercises: readonly TrackedExercise[],
  sessionSets: readonly SetEntry[],
): FinalCardioOffer {
  const last = latestSet(sessionSets);
  if (last === null || last.kind === 'cardio') return { kind: 'none' };

  const exerciseId = suggestedCardioExerciseId(exercises, sessionSets);
  return exerciseId === null ? { kind: 'no_exercise' } : { kind: 'exercise', exerciseId };
}

/**
 * El ejercicio de cardio que se propone, para el cardio final y para apuntar el cardio en marcha, o
 * `null` si no se sigue ninguno.
 *
 * Solo ejercicios de la parte «cardio»: son los únicos que registran cardio (`setKindFor`). Entre
 * ellos, el del cardio más reciente (hoy primero, si no la última vez): quien remata en la cinta
 * suele repetir cinta. Sin cardio registrado nunca, el primero en el orden de la lista.
 */
export function suggestedCardioExerciseId(
  exercises: readonly TrackedExercise[],
  sessionSets: readonly SetEntry[],
): ResourceId | null {
  const cardioExercises = exercises.filter((exercise) => exercise.bodyPart === 'cardio');
  const selectable = new Set(cardioExercises.map((exercise) => exercise.id));
  let best: Candidate | null = null;

  for (const set of sessionSets) {
    if (set.kind !== 'cardio' || !selectable.has(set.trackedExerciseId)) continue;
    best = laterOf(best, set.trackedExerciseId, set.completedAt);
  }
  if (best !== null) return best.exerciseId;

  for (const exercise of cardioExercises) {
    if (exercise.lastCardioSet === null) continue;
    best = laterOf(best, exercise.id, exercise.lastCardioSet.completedAt);
  }
  if (best !== null) return best.exerciseId;

  return cardioExercises[0]?.id ?? null;
}

/** Se queda con la más reciente comparando instantes, nunca texto: las zonas pueden venir distintas. */
function laterOf(
  current: Candidate | null,
  exerciseId: ResourceId,
  completedAt: string,
): Candidate {
  const time = Date.parse(completedAt);
  if (Number.isNaN(time)) return current ?? { exerciseId, time: Number.NEGATIVE_INFINITY };
  if (current !== null && time < current.time) return current;
  return { exerciseId, time };
}
