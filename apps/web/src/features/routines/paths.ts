import type { ResourceId } from '@gymbuddy/shared';

export const ROUTINES_PATH = '/routines';

/** El editor de una rutina: `/routines/{id}`, con el UUID que generó el cliente. */
export function routinePath(routineId: ResourceId): string {
  return `${ROUTINES_PATH}/${routineId}`;
}
