import { resourceIdSchema, type ResourceId } from '@gymbuddy/shared';

/**
 * Identificador de un recurso nuevo. Lo genera la PWA —también sin red— para que reenviar
 * la misma escritura desde la cola offline no pueda crear dos filas.
 */
export function newResourceId(): ResourceId {
  return crypto.randomUUID();
}

/**
 * Un segmento de la URL escrito a mano no tiene por qué ser un identificador. Se valida
 * antes de consultar nada: con basura en la URL la pantalla avisa en vez de pedir al Worker.
 */
export function parseResourceId(value: string | undefined): ResourceId | null {
  const parsed = resourceIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
