import { resourceIdSchema, type ResourceId } from '@gymbuddy/shared';
import { z } from 'zod';
import type { StorageLike } from '../../lib/storage';

/** Una sola clave: solo puede haber una sesión abierta, así que solo hay una rutina que recordar. */
export const SESSION_ROUTINE_STORAGE_KEY = 'gymbuddy.session-routine';

/**
 * Qué rutina guía qué sesión. No es un dato de la API —el Worker no sabe de esto y
 * `workout_session` no guarda la rutina—: es lo que la PWA recuerda en el dispositivo para
 * que el guion no se pierda al salir de la sesión y volver por Hoy.
 */
const sessionRoutineSchema = z.object({
  sessionId: resourceIdSchema,
  routineId: resourceIdSchema,
});

export type SessionRoutineLink = z.infer<typeof sessionRoutineSchema>;

/**
 * La rutina que guía esa sesión, o `null`. Lo guardado para otra sesión no vale: esa se
 * cerró —quizá desde el bot— y la abierta es otra. No se borra, porque la próxima rutina
 * que se empiece la sustituye y cerrar la sesión desde aquí ya la olvida.
 */
export function loadSessionRoutine(storage: StorageLike, sessionId: ResourceId): ResourceId | null {
  let raw: string | null;
  try {
    raw = storage.getItem(SESSION_ROUTINE_STORAGE_KEY);
  } catch (error) {
    // Safari en modo privado lanza al leer: la sesión sigue, solo que sin guion.
    console.warn('No se pudo leer la rutina de la sesión', error);
    return null;
  }
  if (raw === null) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(raw) as unknown;
  } catch {
    clearSessionRoutine(storage);
    return null;
  }

  // Lo escribió otra versión de la PWA: se valida en vez de confiar en su forma.
  const parsed = sessionRoutineSchema.safeParse(payload);
  if (!parsed.success) {
    clearSessionRoutine(storage);
    return null;
  }

  return parsed.data.sessionId === sessionId ? parsed.data.routineId : null;
}

export function saveSessionRoutine(storage: StorageLike, link: SessionRoutineLink): void {
  try {
    storage.setItem(SESSION_ROUTINE_STORAGE_KEY, JSON.stringify(link));
  } catch (error) {
    // La rutina sigue en la URL mientras no se salga de la pantalla; solo no se recordará.
    console.warn('No se pudo recordar la rutina de la sesión', error);
  }
}

export function clearSessionRoutine(storage: StorageLike): void {
  try {
    storage.removeItem(SESSION_ROUTINE_STORAGE_KEY);
  } catch (error) {
    console.warn('No se pudo olvidar la rutina de la sesión', error);
  }
}
