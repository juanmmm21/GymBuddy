import {
  formatGramsAsVolumeKilograms,
  parseKilogramsToGrams,
  type Locale,
  type WeightKilograms,
} from '@gymbuddy/shared';
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

/**
 * El volumen de una sesión, que no cabe en el ancho de un peso: son cuatro cifras contra
 * siete. Sale de gramos enteros y tiene su propio formateador en el dominio por eso.
 */
export function formatVolumeLabel(volumeGrams: number, locale: Locale): string {
  const text = formatGramsAsVolumeKilograms(volumeGrams).replace(/\.?0+$/, '');
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

/**
 * El esfuerzo percibido tal como se lee: "RPE 8,5". El contrato lo trae como número en
 * pasos de media unidad, así que aquí no hay aritmética, solo la coma del idioma.
 */
export function formatRpe(rpe: number, locale: Locale): string {
  const text = String(rpe);
  return `RPE ${locale === 'es' ? text.replace('.', ',') : text}`;
}

/** "hoy", "ayer", "hace 3 días": lo que responde a "¿cuándo entrené por última vez?". */
export function formatDaysAgo(days: number): string {
  if (days === 0) return 'hoy';
  if (days === 1) return 'ayer';
  return `hace ${String(days)} días`;
}

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

/**
 * Un cronómetro: "0:45", "12:30" y, pasada la hora, "1:05:09". Sin unidades, porque el
 * número va debajo de su etiqueta y a mitad de una serie se lee de un vistazo.
 */
export function formatStopwatch(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const rest = seconds % SECONDS_PER_MINUTE;

  const tail = `${padTwo(minutes)}:${padTwo(rest)}`;
  return hours > 0 ? `${String(hours)}:${tail}` : `${String(minutes)}:${padTwo(rest)}`;
}

function padTwo(value: number): string {
  return String(value).padStart(2, '0');
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${String(count)} ${count === 1 ? singular : plural}`;
}
