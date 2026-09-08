import type { ResourceId } from '@gymbuddy/shared';

/**
 * Identificador de un recurso nuevo. Lo genera la PWA —también sin red— para que reenviar
 * la misma escritura desde la cola offline no pueda crear dos filas.
 */
export function newResourceId(): ResourceId {
  return crypto.randomUUID();
}
