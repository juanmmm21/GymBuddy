import { localeSchema, type Locale } from '@gymbuddy/shared';
import { z } from 'zod';
import type { StorageLike } from '../lib/storage';
import { localeFromLanguages } from './tags';

export { FALLBACK_LOCALE, localeFromLanguages, localeFromTag } from './tags';

/**
 * El idioma elegido en este dispositivo. `system` sigue al del sistema (el del navegador) y es lo
 * que hay mientras no se elija otro. Es del dispositivo y no solo de la cuenta: «el del sistema»
 * no significa lo mismo en el móvil en inglés del trabajo que en el de casa.
 */
export const languagePreferenceSchema = z.union([z.literal('system'), localeSchema]);
export type LanguagePreference = z.infer<typeof languagePreferenceSchema>;

export const LANGUAGE_PREFERENCES: readonly LanguagePreference[] = ['system', 'es', 'en'];

export const LANGUAGE_STORAGE_KEY = 'gymbuddy.language';

/** Los idiomas del sistema tal y como los da el navegador, de más a menos preferido. */
export function systemLanguages(nav: Pick<Navigator, 'language' | 'languages'>): string[] {
  return nav.languages.length > 0 ? [...nav.languages] : [nav.language];
}

export function resolveLocale(
  preference: LanguagePreference,
  languages: readonly string[],
): Locale {
  return preference === 'system' ? localeFromLanguages(languages) : preference;
}

export function loadLanguagePreference(storage: StorageLike): LanguagePreference {
  let raw: string | null;
  try {
    raw = storage.getItem(LANGUAGE_STORAGE_KEY);
  } catch (error) {
    // Safari en modo privado lanza al leer: el del sistema es justo lo que se haría sin elegir.
    console.warn('No se pudo leer el idioma elegido; se usa el del sistema', error);
    return 'system';
  }
  const parsed = languagePreferenceSchema.safeParse(raw);
  return parsed.success ? parsed.data : 'system';
}

export function saveLanguagePreference(storage: StorageLike, preference: LanguagePreference): void {
  try {
    if (preference === 'system') storage.removeItem(LANGUAGE_STORAGE_KEY);
    else storage.setItem(LANGUAGE_STORAGE_KEY, preference);
  } catch (error) {
    // Vale para esta visita; al volver a abrir la app tocará elegirlo otra vez.
    console.warn('No se pudo recordar el idioma elegido', error);
  }
}
