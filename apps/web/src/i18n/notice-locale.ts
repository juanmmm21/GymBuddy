import type { Locale } from '@gymbuddy/shared';
import { localeFromLanguages, localeFromTag } from './tags';

/**
 * El service worker no lee el `localStorage` de la página, así que el idioma con el que se escribe
 * el aviso de fin de descanso se le deja en la Cache Storage, que sí comparten los dos. Una
 * respuesta de texto bajo una URL inventada: no es una petición que vaya a salir nunca a la red.
 */
export const NOTICE_LOCALE_CACHE = 'gymbuddy-language';
export const NOTICE_LOCALE_URL = '/__gymbuddy/language';

/** Lo que hace falta de `CacheStorage` para guardar y leer el idioma. */
export interface LocaleCacheStorage {
  open(name: string): Promise<{
    match(request: string): Promise<{ text(): Promise<string> } | undefined>;
    put(request: string, response: Response): Promise<void>;
  }>;
}

/** Lo deja guardado para el siguiente aviso. Si falla, el aviso sale en el idioma del sistema. */
export async function saveNoticeLocale(
  caches: LocaleCacheStorage | undefined,
  locale: Locale,
): Promise<void> {
  if (caches === undefined) return;
  try {
    const cache = await caches.open(NOTICE_LOCALE_CACHE);
    await cache.put(NOTICE_LOCALE_URL, new Response(locale));
  } catch (error) {
    console.warn('No se pudo dejar el idioma para los avisos', error);
  }
}

/** El idioma del aviso: el que dejó la app y, si no dejó ninguno, el del sistema. */
export async function readNoticeLocale(
  caches: LocaleCacheStorage | undefined,
  languages: readonly string[],
): Promise<Locale> {
  try {
    const cache = await caches?.open(NOTICE_LOCALE_CACHE);
    const stored = await cache?.match(NOTICE_LOCALE_URL);
    const locale = stored === undefined ? null : localeFromTag(await stored.text());
    if (locale !== null) return locale;
  } catch (error) {
    console.warn('No se pudo leer el idioma de los avisos; se usa el del sistema', error);
  }
  return localeFromLanguages(languages);
}
