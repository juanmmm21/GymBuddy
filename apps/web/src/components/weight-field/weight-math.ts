import {
  formatGramsAsKilograms,
  parseKilogramsToGrams,
  roundGramsToApiPrecision,
} from '@gymbuddy/shared';

/** Los saltos de los discos: 1.25, 2.5 y 5 kg, en gramos. */
export const WEIGHT_STEPS_GRAMS = [1250, 2500, 5000] as const;
export type WeightStepGrams = (typeof WEIGHT_STEPS_GRAMS)[number];
export const DEFAULT_WEIGHT_STEP_GRAMS: WeightStepGrams = 2500;

/** Lo más pesado que el contrato sabe escribir: "9999.99" kg. */
export const MAX_WEIGHT_GRAMS = 9_999_990;

export type ParsedWeight =
  | { readonly kind: 'empty' }
  | { readonly kind: 'valid'; readonly grams: number }
  | { readonly kind: 'invalid' };

const TRAILING_UNIT = /\s*kg$/i;

/**
 * Convierte lo que teclea el usuario en gramos enteros. Admite la coma del teclado
 * español y el sufijo "kg", y redondea a la resolución de la API (10 g) porque un
 * "82.125" no es representable en el contrato. Nunca pasa por coma flotante.
 */
export function parseWeightInput(text: string): ParsedWeight {
  const normalized = text.trim().replace(TRAILING_UNIT, '').replace(',', '.');
  if (normalized === '') return { kind: 'empty' };

  const withLeadingZero = normalized.startsWith('.') ? `0${normalized}` : normalized;

  try {
    const grams = roundGramsToApiPrecision(parseKilogramsToGrams(withLeadingZero));
    return grams > MAX_WEIGHT_GRAMS ? { kind: 'invalid' } : { kind: 'valid', grams };
  } catch (error) {
    if (error instanceof RangeError) return { kind: 'invalid' };
    throw error;
  }
}

/** Suma o resta un salto de disco, sin bajar de cero ni pasar del tope del contrato. */
export function stepWeight(grams: number | null, deltaGrams: number): number {
  const next = (grams ?? 0) + deltaGrams;
  return Math.min(MAX_WEIGHT_GRAMS, Math.max(0, next));
}

/**
 * Cómo se muestra un peso dentro del campo: "82.5" y no "82.50", "80" y no "80.00".
 * Los ceros del contrato sobran cuando el usuario va a editar el número.
 */
export function formatWeightForInput(grams: number | null): string {
  if (grams === null) return '';
  return formatGramsAsKilograms(grams).replace(/0+$/, '').replace(/\.$/, '');
}
