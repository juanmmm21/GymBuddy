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

/** Qué rutina guía la sesión: se llega así desde el editor de la rutina y desde Hoy. */
export const SESSION_ROUTINE_PARAM = 'routine';

/**
 * La sesión guiada por una rutina. La rutina no se guarda en la sesión —el modelo no la
 * conoce—, así que viaja en la URL; con una sesión ya abierta, la guía en vez de abrir otra.
 */
export function sessionPathForRoutine(routineId: ResourceId): string {
  return `${SESSION_PATH}?${SESSION_ROUTINE_PARAM}=${encodeURIComponent(routineId)}`;
}
