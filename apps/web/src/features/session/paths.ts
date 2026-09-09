import type { ResourceId } from '@gymbuddy/shared';

export const SESSION_PATH = '/session';

/** Con qué ejercicio abre la hoja de registro al llegar desde su ficha. */
export const SESSION_EXERCISE_PARAM = 'exercise';

/**
 * La sesión en curso con un ejercicio ya elegido: es el camino desde su ficha, para que
 * entre serie y serie no haya que buscarlo otra vez en la lista.
 */
export function sessionPathForExercise(exerciseId: ResourceId): string {
  return `${SESSION_PATH}?${SESSION_EXERCISE_PARAM}=${encodeURIComponent(exerciseId)}`;
}
