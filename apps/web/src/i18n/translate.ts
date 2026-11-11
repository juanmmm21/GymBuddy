import type { Locale } from '@gymbuddy/shared';

/**
 * El idioma en el que habla la interfaz ahora mismo. Es una variable del módulo y no solo un
 * contexto de React porque el texto también sale de funciones puras (etiquetas, mensajes de la
 * mascota, errores) que no tienen acceso a hooks. Lo fija `LanguageProvider` antes de pintar, y el
 * árbol de pantallas se vuelve a montar al cambiarlo, así que nadie se queda con el anterior.
 */
let current: Locale = 'es';

export function currentLocale(): Locale {
  return current;
}

export function setCurrentLocale(locale: Locale): void {
  current = locale;
}

/**
 * Un texto de la interfaz en los dos idiomas de la app. El español va primero porque es el idioma
 * en el que se escribió la app; tenerlos juntos en el sitio donde se usan hace imposible añadir una
 * frase en un idioma y olvidarla en el otro, que es lo que pasa con un diccionario aparte.
 */
export function t(es: string, en: string): string {
  return current === 'es' ? es : en;
}

/** "1 serie" / "3 series" en el idioma actual. */
export function plural(
  count: number,
  es: readonly [singular: string, plural: string],
  en: readonly [singular: string, plural: string],
): string {
  const [one, many] = current === 'es' ? es : en;
  return `${String(count)} ${count === 1 ? one : many}`;
}

const INTL_LOCALE: Readonly<Record<Locale, string>> = { es: 'es-ES', en: 'en-GB' };

/** La etiqueta BCP 47 con la que se formatean fechas y números en un idioma de la app. */
export function intlLocale(locale: Locale = current): string {
  return INTL_LOCALE[locale];
}
