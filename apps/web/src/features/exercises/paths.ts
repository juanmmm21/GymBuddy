import { resourceIdSchema, type ResourceId } from '@gymbuddy/shared';

export const EXERCISES_PATH = '/exercises';

/** La ficha de un ejercicio seguido: `/exercises/{id}`, con el UUID que generó el cliente. */
export function trackedExercisePath(exerciseId: ResourceId): string {
  return `${EXERCISES_PATH}/${exerciseId}`;
}

/**
 * Un segmento de la URL escrito a mano no tiene por qué ser un identificador. Se valida
 * antes de consultar nada: con basura en la URL la pantalla avisa en vez de pedir al Worker.
 */
export function parseResourceId(value: string | undefined): ResourceId | null {
  const parsed = resourceIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
