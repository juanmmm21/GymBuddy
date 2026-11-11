import type { Locale } from '@gymbuddy/shared';

// Sin zod ni nada más pesado: esto también lo carga el service worker para el aviso de descanso.

/** El idioma que entiende la app cuando el del sistema no es ninguno de los suyos. */
export const FALLBACK_LOCALE: Locale = 'en';

/** El idioma de la app que corresponde a una etiqueta como `es-419` o `en-US`, si hay alguno. */
export function localeFromTag(tag: string): Locale | null {
  const primary = tag.trim().toLowerCase().split(/[-_]/)[0];
  return primary === 'es' || primary === 'en' ? primary : null;
}

/**
 * El primero de los idiomas preferidos del sistema que la app sabe hablar. Se recorre la lista
 * entera (`navigator.languages`) y no solo el primero: alguien con el sistema en catalán y el
 * español detrás quiere la app en español, no en el idioma de reserva.
 */
export function localeFromLanguages(languages: readonly string[]): Locale {
  for (const tag of languages) {
    const locale = localeFromTag(tag);
    if (locale !== null) return locale;
  }
  return FALLBACK_LOCALE;
}
