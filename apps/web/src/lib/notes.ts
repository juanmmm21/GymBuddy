/** Tope del contrato para el nombre de un ejercicio propio (`trackedExerciseNameSchema`). */
export const MAX_EXERCISE_NAME_LENGTH = 120;

/** Tope del contrato para las notas de un ejercicio (`updateTrackedExerciseRequestSchema`). */
export const MAX_EXERCISE_NOTES_LENGTH = 500;

/** Tope del contrato para las notas de una sesión (`endSessionRequestSchema`). */
export const MAX_SESSION_NOTES_LENGTH = 1000;

/**
 * Lo que se teclea en un campo de notas, tal como viaja al Worker: sin espacios de más y
 * `null` cuando no queda nada, que es como el contrato dice "sin notas". Una cadena vacía
 * guardada se leería como una nota que existe y no dice nada.
 */
export function normalizeNotes(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === '' ? null : trimmed;
}
