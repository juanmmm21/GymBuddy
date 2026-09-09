import type { ResourceId } from '@gymbuddy/shared';

export const HISTORY_PATH = '/history';

/** El detalle de una sesión pasada: `/history/{id}`, con el UUID que generó el cliente. */
export function sessionDetailPath(sessionId: ResourceId): string {
  return `${HISTORY_PATH}/${sessionId}`;
}
