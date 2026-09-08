import { parseKilogramsToGrams, type Locale, type WeightKilograms } from '@gymbuddy/shared';
import { formatWeightForInput } from '../components/weight-field/weight-math';

const INTL_LOCALE: Readonly<Record<Locale, string>> = { es: 'es-ES', en: 'en-GB' };

/**
 * Un peso del contrato ("82.50") tal como se lee en pantalla: "82,5 kg" en español. Pasa
 * por gramos enteros y no por `Number(...)`, igual que todo lo demás que toca un peso.
 */
export function formatWeightLabel(weight: WeightKilograms, locale: Locale): string {
  const text = formatWeightForInput(parseKilogramsToGrams(weight));
  return `${locale === 'es' ? text.replace('.', ',') : text} kg`;
}

/** "lun, 8 sept" o "Mon, 8 Sept": el año sobra en una lista de sesiones recientes. */
export function formatSessionDate(iso: string, locale: Locale, now: Date = new Date()): string {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date);
}

export function formatTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** "hoy", "ayer", "hace 3 días": lo que responde a "¿cuándo entrené por última vez?". */
export function formatDaysAgo(days: number): string {
  if (days === 0) return 'hoy';
  if (days === 1) return 'ayer';
  return `hace ${String(days)} días`;
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${String(count)} ${count === 1 ? singular : plural}`;
}
