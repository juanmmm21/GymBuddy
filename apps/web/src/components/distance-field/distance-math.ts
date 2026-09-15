import { MAX_CARDIO_DISTANCE_METERS, type Locale } from '@gymbuddy/shared';

const METERS_PER_KILOMETER = 1000;

export type ParsedDistance =
  | { readonly kind: 'empty' }
  | { readonly kind: 'valid'; readonly meters: number }
  | { readonly kind: 'invalid' };

/* Hasta tres decimales: el metro es la resolución del contrato, y un cuarto no se puede guardar. */
const KILOMETERS_PATTERN = /^(?<whole>\d{0,3})(?:[.,](?<fraction>\d{0,3}))?(?:\s*km)?$/i;

/**
 * Convierte lo tecleado, en kilómetros y con la coma del teclado español, en metros enteros. Opera
 * sobre la cadena, como el peso: `Number('5.25') * 1000` puede no dar un entero exacto.
 */
export function parseDistanceInput(text: string): ParsedDistance {
  const normalized = text.trim();
  if (normalized === '') return { kind: 'empty' };

  const groups = KILOMETERS_PATTERN.exec(normalized)?.groups;
  const whole = groups?.whole ?? '';
  const fraction = groups?.fraction ?? '';
  if (groups === undefined || (whole === '' && fraction === '')) return { kind: 'invalid' };

  const meters =
    Number.parseInt(whole === '' ? '0' : whole, 10) * METERS_PER_KILOMETER +
    Number.parseInt(fraction.padEnd(3, '0'), 10);
  if (meters <= 0 || meters > MAX_CARDIO_DISTANCE_METERS) return { kind: 'invalid' };

  return { kind: 'valid', meters };
}

/** Lo que el campo enseña al editar: los kilómetros sin ceros de más, con la coma del idioma. */
export function formatDistanceForInput(meters: number, locale: Locale): string {
  const whole = Math.floor(meters / METERS_PER_KILOMETER);
  const fraction = String(meters % METERS_PER_KILOMETER)
    .padStart(3, '0')
    .replace(/0+$/, '');
  const separator = locale === 'es' ? ',' : '.';

  return fraction === '' ? String(whole) : `${String(whole)}${separator}${fraction}`;
}
