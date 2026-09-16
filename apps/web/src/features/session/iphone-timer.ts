import { z } from 'zod';
import type { StorageLike } from '../../lib/storage';
import type { DevicePlatform } from '../install/platform';

/**
 * El descanso en el Temporizador del iPhone, a través de un Atajo que cada uno crea una vez (lo pidió
 * Juan el 2026-09-16). Es el único aviso que suena con la app cerrada **y sin cobertura**: la web no
 * puede programar notificaciones locales e iOS congela la PWA en cuanto sale de la pantalla, así que
 * quien cuenta es el reloj del sistema. El precio es salir de la app un momento en cada descanso.
 */

/** El nombre exacto que hay que darle al Atajo: la URL lo busca por nombre. */
export const IPHONE_TIMER_SHORTCUT_NAME = 'GymBuddy descanso';

/**
 * Del dispositivo y no de la cuenta: el Atajo existe en un iPhone concreto, y en otro móvil
 * encenderlo abriría la app Atajos para decir que no lo encuentra.
 */
export const IPHONE_TIMER_STORAGE_KEY = 'gymbuddy.iphone-timer';

const storedSchema = z.object({ enabled: z.boolean() });

/**
 * El enlace que ejecuta el Atajo con los segundos como texto (`shortcuts://run-shortcut`, formato de
 * la guía de Atajos de Apple). Nunca menos de un segundo: un temporizador de cero no arranca y la app
 * Atajos se quedaría delante sin hacer nada.
 */
export function iphoneTimerShortcutUrl(seconds: number): string {
  const whole = Math.max(1, Math.ceil(seconds));
  const params = new URLSearchParams({
    name: IPHONE_TIMER_SHORTCUT_NAME,
    input: 'text',
    text: String(whole),
  });
  // `URLSearchParams` codifica el espacio como `+`, y Atajos busca el nombre literal: va como `%20`.
  return `shortcuts://run-shortcut?${params.toString().replaceAll('+', '%20')}`;
}

/** Solo en un iPhone o un iPad, y solo si se encendió en Ajustes: fuera de iOS no hay Atajos. */
export function offersIphoneTimer(platform: DevicePlatform, enabled: boolean): boolean {
  return platform === 'ios' && enabled;
}

export function loadIphoneTimerEnabled(storage: StorageLike): boolean {
  let raw: string | null;
  try {
    raw = storage.getItem(IPHONE_TIMER_STORAGE_KEY);
  } catch (error) {
    // Safari en modo privado lanza al leer: se entrena igual, con el cronómetro de la pantalla.
    console.warn('No se pudo leer si el temporizador del iPhone está encendido', error);
    return false;
  }
  if (raw === null) return false;

  let payload: unknown;
  try {
    payload = JSON.parse(raw) as unknown;
  } catch (error) {
    console.warn('La preferencia del temporizador del iPhone no es JSON; queda apagado', error);
    return false;
  }

  const parsed = storedSchema.safeParse(payload);
  return parsed.success && parsed.data.enabled;
}

export function saveIphoneTimerEnabled(storage: StorageLike, enabled: boolean): void {
  try {
    storage.setItem(IPHONE_TIMER_STORAGE_KEY, JSON.stringify({ enabled }));
  } catch (error) {
    // Vale durante esta visita a Ajustes; solo no se recordará al volver a abrir la app.
    console.warn('No se pudo recordar el temporizador del iPhone', error);
  }
}
