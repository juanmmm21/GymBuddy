import type { ResourceId } from '@gymbuddy/shared';

export const EXERCISES_PATH = '/exercises';

/** La ficha de un ejercicio seguido: `/exercises/{id}`, con el UUID que generó el cliente. */
export function trackedExercisePath(exerciseId: ResourceId): string {
  return `${EXERCISES_PATH}/${exerciseId}`;
}
