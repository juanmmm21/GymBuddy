import { sessionSchema, type Session } from '@gymbuddy/shared';

/** Clave única en `localStorage`; cambiarla equivale a cerrar la sesión de todo el mundo. */
export const SESSION_STORAGE_KEY = 'gymbuddy.session';

/** Subconjunto de `Storage` que se usa: lo justo para sustituirlo en los tests. */
export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Recupera la sesión guardada, o `null` si no la hay, no cumple el contrato o ya caducó.
 * Lo que hay en `localStorage` lo escribió otra versión de la PWA, así que se valida con
 * el mismo esquema que una respuesta del Worker y no se confía en su forma.
 */
export function loadStoredSession(storage: SessionStorageLike, now: Date): Session | null {
  let raw: string | null;
  try {
    raw = storage.getItem(SESSION_STORAGE_KEY);
  } catch (error) {
    // Safari en modo privado o un almacenamiento lleno lanzan al leer: sin sesión, no roto.
    console.warn('No se pudo leer la sesión guardada', error);
    return null;
  }
  if (raw === null) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(raw) as unknown;
  } catch {
    clearStoredSession(storage);
    return null;
  }

  const parsed = sessionSchema.safeParse(payload);
  if (!parsed.success || isExpired(parsed.data, now)) {
    clearStoredSession(storage);
    return null;
  }

  return parsed.data;
}

export function saveStoredSession(storage: SessionStorageLike, session: Session): void {
  try {
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch (error) {
    // La sesión sigue viva en memoria; solo no sobrevivirá a cerrar la pestaña.
    console.warn('No se pudo guardar la sesión', error);
  }
}

export function clearStoredSession(storage: SessionStorageLike): void {
  try {
    storage.removeItem(SESSION_STORAGE_KEY);
  } catch (error) {
    console.warn('No se pudo borrar la sesión guardada', error);
  }
}

export function isExpired(session: Session, now: Date): boolean {
  return Date.parse(session.expiresAt) <= now.getTime();
}
