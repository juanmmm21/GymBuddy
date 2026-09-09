/**
 * Conversiones entre la representación de almacenamiento (enteros exactos) y la del
 * contrato de la API. El peso se guarda en gramos y el RPE en décimas: la coma flotante
 * no entra en ningún punto, porque un 82.5 que se convierte en 82.49999 es un bug visible.
 */

const GRAMS_PER_KILOGRAM = 1000;
/** La API expone kilogramos con dos decimales, es decir, con resolución de 10 gramos. */
const GRAMS_PER_API_UNIT = 10;
const MAX_WEIGHT_GRAMS = 9_999_999;
/**
 * El volumen es peso × repeticiones, así que crece tres órdenes de magnitud sobre un peso
 * suelto y no cabe en el rango de este. Tiene su propio tope y su propio formato en vez de
 * ensanchar el del peso: un peso de cinco cifras en kilogramos es un dato equivocado.
 */
const MAX_VOLUME_GRAMS = 9_999_999_999;

const KILOGRAMS_PATTERN = /^(?<whole>\d{1,4})(?:\.(?<fraction>\d{1,3}))?$/;
/** El mismo formato con el ancho de un volumen: siete cifras enteras en vez de cuatro. */
const VOLUME_KILOGRAMS_PATTERN = /^(?<whole>\d{1,7})(?:\.(?<fraction>\d{1,3}))?$/;

/** Formato en el que viaja un peso por la API: kilogramos con exactamente dos decimales. */
export const API_WEIGHT_PATTERN = /^\d{1,4}\.\d{2}$/;

/** Formato de una magnitud acumulada (volumen): los mismos dos decimales, más cifras enteras. */
export const API_VOLUME_PATTERN = /^\d{1,7}\.\d{2}$/;

const TENTHS_PER_RPE_POINT = 10;
const RPE_TENTHS_STEP = 5;
const MIN_RPE_TENTHS = 10;
const MAX_RPE_TENTHS = 100;

/**
 * Redondea a la resolución que la API sabe representar (10 g), al alza en el empate.
 * Se aplica solo a valores derivados de una fórmula: lo que registra el usuario ya es exacto.
 */
export function roundGramsToApiPrecision(grams: number): number {
  assertStorableGrams(grams, MAX_WEIGHT_GRAMS);
  return roundToApiUnit(grams);
}

export function formatGramsAsKilograms(grams: number): string {
  assertStorableGrams(grams, MAX_WEIGHT_GRAMS);
  return formatGrams(grams);
}

/** Igual, para una magnitud acumulada que no cabe en el rango de un peso de barra. */
export function formatGramsAsVolumeKilograms(grams: number): string {
  assertStorableGrams(grams, MAX_VOLUME_GRAMS);
  return formatGrams(grams);
}

/**
 * Convierte el peso del contrato a gramos operando sobre la cadena: pasar por
 * `Number('82.5') * 1000` daría 82499.99999999999 en algún valor y el error se propagaría.
 */
export function parseKilogramsToGrams(kilograms: string): number {
  return parseToGrams(kilograms, KILOGRAMS_PATTERN, MAX_WEIGHT_GRAMS, 'Peso');
}

/**
 * Igual, para el volumen que devuelve la API. Existe porque lo que llega calculado del
 * Worker —el volumen de un día o de una sesión— también tiene que entrar en gramos
 * enteros para poder formatearse: `Number(volume)` sería la coma flotante entrando por
 * la puerta de atrás justo donde el proyecto la prohíbe.
 */
export function parseVolumeKilogramsToGrams(kilograms: string): number {
  return parseToGrams(kilograms, VOLUME_KILOGRAMS_PATTERN, MAX_VOLUME_GRAMS, 'Volumen');
}

function parseToGrams(
  kilograms: string,
  pattern: RegExp,
  maxGrams: number,
  description: string,
): number {
  const groups = pattern.exec(kilograms)?.groups;
  if (groups?.whole === undefined) {
    throw new RangeError(`${description} fuera del formato del contrato: "${kilograms}"`);
  }

  const grams =
    Number(groups.whole) * GRAMS_PER_KILOGRAM + Number((groups.fraction ?? '').padEnd(3, '0'));
  assertStorableGrams(grams, maxGrams);

  return grams;
}

export function rpeToTenths(rpe: number): number {
  const tenths = Math.round(rpe * TENTHS_PER_RPE_POINT);
  if (
    tenths < MIN_RPE_TENTHS ||
    tenths > MAX_RPE_TENTHS ||
    tenths % RPE_TENTHS_STEP !== 0 ||
    Math.abs(rpe * TENTHS_PER_RPE_POINT - tenths) > Number.EPSILON * TENTHS_PER_RPE_POINT
  ) {
    throw new RangeError(`RPE fuera de rango o sin paso de media unidad: ${String(rpe)}`);
  }

  return tenths;
}

export function tenthsToRpe(tenths: number): number {
  if (!Number.isInteger(tenths) || tenths < MIN_RPE_TENTHS || tenths > MAX_RPE_TENTHS) {
    throw new RangeError(`RPE almacenado fuera de rango: ${String(tenths)}`);
  }

  // Solo se guardan múltiplos de 5 décimas, cuya mitad exacta sí es representable en binario.
  return tenths / TENTHS_PER_RPE_POINT;
}

function roundToApiUnit(grams: number): number {
  const remainder = grams % GRAMS_PER_API_UNIT;
  return remainder * 2 >= GRAMS_PER_API_UNIT
    ? grams - remainder + GRAMS_PER_API_UNIT
    : grams - remainder;
}

function formatGrams(grams: number): string {
  const rounded = roundToApiUnit(grams);
  const gramsPart = rounded % GRAMS_PER_KILOGRAM;
  // El numerador es múltiplo exacto de 1000, así que la división no pierde precisión.
  const kilograms = (rounded - gramsPart) / GRAMS_PER_KILOGRAM;
  const hundredths = gramsPart / GRAMS_PER_API_UNIT;

  return `${String(kilograms)}.${String(hundredths).padStart(2, '0')}`;
}

function assertStorableGrams(grams: number, maxGrams: number): void {
  if (!Number.isInteger(grams) || grams < 0 || grams > maxGrams) {
    throw new RangeError(`Cantidad en gramos no almacenable: ${String(grams)}`);
  }
}
