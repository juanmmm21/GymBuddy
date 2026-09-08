/** Tope del contrato (`updateTrackedExerciseRequestSchema.notes`). */
export const MAX_NOTES_LENGTH = 500;

/**
 * Lo que se teclea en el campo de notas, tal como viaja al Worker: sin espacios de más y
 * `null` cuando no queda nada, que es como el contrato dice "sin notas". Una cadena vacía
 * guardada se leería como una nota que existe y no dice nada.
 */
export function normalizeNotes(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === '' ? null : trimmed;
}
