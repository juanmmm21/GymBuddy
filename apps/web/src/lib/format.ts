import {
  formatGramsAsVolumeKilograms,
  parseKilogramsToGrams,
  parseVolumeKilogramsToGrams,
  type Locale,
  type PersonalRecord,
  type SetEntry,
  type WeightKilograms,
  type WeightUnit,
} from '@gymbuddy/shared';
import { formatWeightForInput } from '../components/weight-field/weight-math';

const INTL_LOCALE: Readonly<Record<Locale, string>> = { es: 'es-ES', en: 'en-GB' };

/**
 * Un peso del contrato ("82.50") tal como se lee en pantalla: "82,5 kg" en español. Pasa
 * por gramos enteros y no por `Number(...)`, igual que todo lo demás que toca un peso.
 */
export function formatWeightLabel(weight: WeightKilograms, locale: Locale): string {
  return formatWeightInUnit(parseKilogramsToGrams(weight), 'kg', locale);
}

/** Lo que se añade al peso de un ejercicio a un brazo: el peso es el de uno solo. */
export const PER_ARM = 'por brazo';

/** Lo que se añade al volumen de un ejercicio a un brazo: cuenta los dos. */
export const BOTH_SIDES = 'los dos lados';

/**
 * El peso de un ejercicio concreto: "20 kg por brazo" si es a un brazo y "82,5 kg" si no. Pide la
 * marca siempre, igual que `ProgressionSet.unilateral`: un sitio nuevo que enseñe un peso tiene que
 * decidir, y olvidarlo haría leer los 20 kg de una mancuerna como si fueran los de las dos.
 */
export function formatExerciseWeightLabel(
  weight: WeightKilograms,
  locale: Locale,
  unilateral: boolean,
): string {
  const label = formatWeightLabel(weight, locale);
  return unilateral ? `${label} ${PER_ARM}` : label;
}

/**
 * El número de un peso en gramos, sin su unidad: "82,5". Es lo que va en el eje de una
 * gráfica, donde los kilogramos se dicen una sola vez en la leyenda y no en cada marca.
 */
export function formatWeightValue(grams: number, locale: Locale, unit: WeightUnit = 'kg'): string {
  const text = formatWeightForInput(grams, unit);
  return locale === 'es' ? text.replace('.', ',') : text;
}

/** Un peso en gramos leído en una unidad concreta: "82,5 kg" o "100 lb". */
export function formatWeightInUnit(grams: number, unit: WeightUnit, locale: Locale): string {
  return `${formatWeightValue(grams, locale, unit)} ${unit}`;
}

/**
 * El valor de una marca, siempre en kilos. No pasa por `formatWeightLabel` porque llega con el ancho
 * del volumen (`volumeKilogramsSchema`): una marca de volumen de más de 9999 kg, una prensa pesada a
 * diez repeticiones, no cabe en el patrón de un peso y reventaría la pantalla.
 *
 * En uno a un brazo, el peso máximo y el 1RM son de un brazo (lo decidió Juan) y el volumen ya suma
 * los dos lados: sin decirlo, «400 kg» parecería el doble de lo que se levantó.
 */
export function formatRecordValueLabel(
  record: Pick<PersonalRecord, 'kind' | 'value'>,
  locale: Locale,
  unilateral: boolean,
): string {
  const value = formatVolumeLabel(parseVolumeKilogramsToGrams(record.value), locale);
  if (!unilateral) return value;
  return record.kind === 'max_volume' ? `${value}, ${BOTH_SIDES}` : `${value} ${PER_ARM}`;
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

/** "6 sept": la fecha sin el día de la semana, para el eje de una gráfica. */
export function formatShortDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: 'numeric',
    month: 'short',
  }).format(new Date(iso));
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

/**
 * Lo que duró una sesión terminada: "1 h 5 min" o "45 min". No es un cronómetro —eso es
 * `formatStopwatch`—, así que los segundos sobran: por debajo del minuto se dice así.
 */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds < SECONDS_PER_MINUTE) return 'menos de 1 min';

  const hours = Math.floor(seconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  if (hours === 0) return `${String(minutes)} min`;

  return minutes === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(minutes)} min`;
}

/**
 * Lo que duró una serie de cardio: "30 min", "1 h 5 min" o "12 min 30 s". A diferencia de una
 * sesión, aquí los segundos sí cuentan: un sprint de 45 segundos es una serie de verdad.
 */
export function formatCardioDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const rest = seconds % SECONDS_PER_MINUTE;

  const parts = [
    hours > 0 ? `${String(hours)} h` : null,
    minutes > 0 ? `${String(minutes)} min` : null,
    rest > 0 || seconds === 0 ? `${String(rest)} s` : null,
  ];
  return parts.filter((part) => part !== null).join(' ');
}

const METERS_PER_KILOMETER = 1000;
const METERS_PER_HUNDREDTH_KILOMETER = 10;

/**
 * Una distancia en metros enteros: "800 m" por debajo del kilómetro y "5,2 km" por encima, con dos
 * decimales como mucho. El redondeo a centésimas se hace con enteros, sin pasar por coma flotante.
 */
export function formatDistanceLabel(meters: number, locale: Locale): string {
  if (meters < METERS_PER_KILOMETER) return `${String(meters)} m`;

  const hundredths = Math.floor(
    (meters + METERS_PER_HUNDREDTH_KILOMETER / 2) / METERS_PER_HUNDREDTH_KILOMETER,
  );
  const whole = Math.floor(hundredths / 100);
  const decimals = String(hundredths % 100)
    .padStart(2, '0')
    .replace(/0+$/, '');
  const separator = locale === 'es' ? ',' : '.';

  return `${String(whole)}${decimals === '' ? '' : separator + decimals} km`;
}

/**
 * El valor de una serie tal y como se lee en una fila: "82,5 kg × 8", "20 kg por brazo × 10" o
 * "30 min · 5,2 km". Una sola función para las listas que pintan series, para que ninguna se olvide
 * del cardio ni de los ejercicios a un brazo.
 */
export function formatSetValueLabel(set: SetEntry, locale: Locale, unilateral: boolean): string {
  if (set.kind === 'strength')
    return `${formatExerciseWeightLabel(set.weight, locale, unilateral)} × ${String(set.reps)}`;

  const duration = formatCardioDuration(set.durationSeconds);
  return set.distanceMeters === null
    ? duration
    : `${duration} · ${formatDistanceLabel(set.distanceMeters, locale)}`;
}

function padTwo(value: number): string {
  return String(value).padStart(2, '0');
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${String(count)} ${count === 1 ? singular : plural}`;
}
