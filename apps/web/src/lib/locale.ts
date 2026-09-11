import type { Locale } from '@gymbuddy/shared';

/**
 * El idioma con el que arranca una cuenta: el del navegador si es español (`es`, `es-ES`,
 * `es-419`…) y, si no, inglés, que es el otro que tiene la app.
 */
export function localeFromLanguage(language: string | undefined): Locale {
  return language?.toLowerCase().startsWith('es') === true ? 'es' : 'en';
}
