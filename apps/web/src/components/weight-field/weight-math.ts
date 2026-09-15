import {
  centipoundsToGrams,
  formatCentipoundsAsPounds,
  formatGramsAsKilograms,
  gramsToCentipounds,
  parseKilogramsToGrams,
  parsePoundsToCentipounds,
  roundCentipoundsToResolution,
  roundGramsToApiPrecision,
  type WeightUnit,
} from '@gymbuddy/shared';

/**
 * Los saltos de los botones +/−, en la unidad entera de cada sistema: gramos para los kilos
 * (1,25, 2,5 y 5 kg, los discos) y centésimas de libra para las libras (2,5, 5 y 10 lb, lo que
 * suben las máquinas rotuladas en libras). Un salto en libras no es un número redondo de gramos,
 * así que no se guarda convertido: se suma en libras y se convierte el resultado.
 */
export const WEIGHT_STEPS: Readonly<Record<WeightUnit, readonly number[]>> = {
  kg: [1250, 2500, 5000],
  lb: [250, 500, 1000],
};
export const DEFAULT_WEIGHT_STEPS: Readonly<Record<WeightUnit, number>> = { kg: 2500, lb: 500 };

/** Lo más pesado que el contrato sabe escribir: "9999.99" kg. */
export const MAX_WEIGHT_GRAMS = 9_999_990;

export type ParsedWeight =
  | { readonly kind: 'empty' }
  | { readonly kind: 'valid'; readonly grams: number }
  | { readonly kind: 'invalid' };

const TRAILING_UNIT: Readonly<Record<WeightUnit, RegExp>> = {
  kg: /\s*kg$/i,
  lb: /\s*lbs?$/i,
};

/**
 * Convierte lo que teclea el usuario, en la unidad del campo, en gramos enteros. Admite la coma
 * del teclado español y el sufijo de la unidad, y redondea a lo que el contrato representa: 10 g
 * en kilos y 0,05 lb en libras (ver `POUND_RESOLUTION_CENTIPOUNDS`). Nunca pasa por coma flotante.
 */
export function parseWeightInput(text: string, unit: WeightUnit = 'kg'): ParsedWeight {
  const normalized = text.trim().replace(TRAILING_UNIT[unit], '').replace(',', '.');
  if (normalized === '') return { kind: 'empty' };

  const withLeadingZero = normalized.startsWith('.') ? `0${normalized}` : normalized;

  try {
    const grams = roundGramsToApiPrecision(
      unit === 'kg'
        ? parseKilogramsToGrams(withLeadingZero)
        : centipoundsToGrams(
            roundCentipoundsToResolution(parsePoundsToCentipounds(withLeadingZero)),
          ),
    );
    return grams > MAX_WEIGHT_GRAMS ? { kind: 'invalid' } : { kind: 'valid', grams };
  } catch (error) {
    if (error instanceof RangeError) return { kind: 'invalid' };
    throw error;
  }
}

/**
 * Suma o resta un salto, sin bajar de cero ni pasar del tope del contrato. En libras se suma sobre
 * lo que el campo enseña (el peso ya leído en libras), no sobre los gramos: así 100 lb + 5 lb son
 * 105 lb en pantalla y no 104,95 por arrastrar el redondeo de la conversión.
 */
export function stepWeight(grams: number | null, delta: number, unit: WeightUnit = 'kg'): number {
  if (unit === 'kg') {
    return clampGrams((grams ?? 0) + delta);
  }

  const centipounds = Math.max(0, (grams === null ? 0 : gramsToCentipounds(grams)) + delta);
  const next = roundGramsToApiPrecision(
    Math.min(MAX_WEIGHT_GRAMS, centipoundsToGrams(centipounds)),
  );
  return clampGrams(next);
}

/**
 * Cómo se muestra un peso dentro del campo: "82.5" y no "82.50", "80" y no "80.00". Los ceros del
 * contrato sobran cuando el usuario va a editar el número.
 */
export function formatWeightForInput(grams: number | null, unit: WeightUnit = 'kg'): string {
  if (grams === null) return '';
  return trimZeros(
    unit === 'kg'
      ? formatGramsAsKilograms(grams)
      : formatCentipoundsAsPounds(gramsToCentipounds(grams)),
  );
}

/** Un salto de `WEIGHT_STEPS` tal como se lee en su botón: "1.25", "2.5", "10". */
export function formatWeightStep(step: number, unit: WeightUnit): string {
  return trimZeros(unit === 'kg' ? formatGramsAsKilograms(step) : formatCentipoundsAsPounds(step));
}

function trimZeros(text: string): string {
  return text.replace(/0+$/, '').replace(/\.$/, '');
}

function clampGrams(grams: number): number {
  return Math.min(MAX_WEIGHT_GRAMS, Math.max(0, grams));
}
