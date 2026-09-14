import { z } from 'zod';
import type { StorageLike } from '../../lib/storage';
import { DEFAULT_REST_PREFERENCES, isExerciseRest, isSetRest, type RestPreferences } from './rest';

/**
 * Del dispositivo y no de la cuenta: el descanso que se elige depende de cómo se entrena en ese
 * gimnasio, y viajar entre móviles no aporta. Lo pidió Juan: que se quede hasta volver a cambiarlo.
 */
export const REST_PREFERENCES_STORAGE_KEY = 'gymbuddy.rest-preferences';

const storedPreferencesSchema = z.object({
  setSeconds: z.int(),
  exerciseSeconds: z.int(),
});

/**
 * Los objetivos recordados. Lo que falte, no se pueda leer o no sea una opción válida vuelve al
 * valor por defecto campo a campo: una versión nueva que cambie las opciones no puede dejar el
 * temporizador con un objetivo que la pantalla ya no ofrece.
 */
export function loadRestPreferences(storage: StorageLike): RestPreferences {
  let raw: string | null;
  try {
    raw = storage.getItem(REST_PREFERENCES_STORAGE_KEY);
  } catch (error) {
    // Safari en modo privado lanza al leer: se entrena igual, con los de por defecto.
    console.warn('No se pudo leer el descanso recordado', error);
    return DEFAULT_REST_PREFERENCES;
  }
  if (raw === null) return DEFAULT_REST_PREFERENCES;

  let payload: unknown;
  try {
    payload = JSON.parse(raw) as unknown;
  } catch (error) {
    console.warn('El descanso recordado no es JSON; se usan los de por defecto', error);
    return DEFAULT_REST_PREFERENCES;
  }

  const parsed = storedPreferencesSchema.safeParse(payload);
  if (!parsed.success) return DEFAULT_REST_PREFERENCES;

  const { setSeconds, exerciseSeconds } = parsed.data;
  return {
    setSeconds: isSetRest(setSeconds) ? setSeconds : DEFAULT_REST_PREFERENCES.setSeconds,
    exerciseSeconds: isExerciseRest(exerciseSeconds)
      ? exerciseSeconds
      : DEFAULT_REST_PREFERENCES.exerciseSeconds,
  };
}

export function saveRestPreferences(storage: StorageLike, preferences: RestPreferences): void {
  try {
    storage.setItem(REST_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch (error) {
    // El objetivo se aplica igual durante esta visita; solo no se recordará la próxima.
    console.warn('No se pudo recordar el descanso elegido', error);
  }
}
