/**
 * Libras sin coma flotante. El peso se sigue guardando en gramos enteros; las libras son solo una
 * forma de teclearlo y de leerlo, porque en el gimnasio de Juan las máquinas van rotuladas en
 * libras y las mancuernas en kilos.
 *
 * La libra internacional vale exactamente 453,59237 g, así que una centésima de libra son
 * 45.359.237 / 10.000.000 g: todo se opera con esos dos enteros y un redondeo explícito.
 */

export const WEIGHT_UNITS = ['kg', 'lb'] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];

export const CENTIPOUNDS_PER_POUND = 100;

/** Numerador y denominador de los gramos que pesa una centésima de libra. */
const GRAMS_PER_CENTIPOUND_NUMERATOR = 45_359_237;
const GRAMS_PER_CENTIPOUND_DENOMINATOR = 10_000_000;

/**
 * La resolución con la que se leen las libras: 0,05 lb. No es gusto: la API guarda el peso con
 * resolución de 10 g (0,022 lb), así que una cifra más fina no sobrevive a la ida y vuelta —1,26 lb
 * volvería como 1,25 o 1,27—. Con pasos de 0,05 lb el error de los 10 g (como mucho 5 g, 0,011 lb)
 * nunca llega a la mitad del paso, y lo tecleado vuelve exactamente igual.
 */
export const POUND_RESOLUTION_CENTIPOUNDS = 5;

/** "22045.2" lb es el tope de un peso en kilos del contrato ("9999.99"): cinco cifras enteras. */
const MAX_CENTIPOUNDS = 9_999_999;

const POUNDS_PATTERN = /^(?<whole>\d{1,5})(?:\.(?<fraction>\d{1,2}))?$/;

/** Un peso en gramos leído en libras, redondeado a la resolución de 0,05 lb. */
export function gramsToCentipounds(grams: number): number {
  assertNonNegativeInteger(grams, 'Gramos');
  const scaled = grams * GRAMS_PER_CENTIPOUND_DENOMINATOR;
  assertSafe(scaled, grams);

  const steps = divideRoundingHalfUp(
    scaled,
    GRAMS_PER_CENTIPOUND_NUMERATOR * POUND_RESOLUTION_CENTIPOUNDS,
  );
  return steps * POUND_RESOLUTION_CENTIPOUNDS;
}

/** Centésimas de libra a gramos enteros, al gramo más cercano (al alza en el empate). */
export function centipoundsToGrams(centipounds: number): number {
  assertCentipounds(centipounds);
  return divideRoundingHalfUp(
    centipounds * GRAMS_PER_CENTIPOUND_NUMERATOR,
    GRAMS_PER_CENTIPOUND_DENOMINATOR,
  );
}

/** Lleva unas centésimas de libra tecleadas a la resolución que sobrevive a la API. */
export function roundCentipoundsToResolution(centipounds: number): number {
  assertCentipounds(centipounds);
  return (
    divideRoundingHalfUp(centipounds, POUND_RESOLUTION_CENTIPOUNDS) * POUND_RESOLUTION_CENTIPOUNDS
  );
}

/**
 * "100.25" → 10025, operando sobre la cadena como `parseKilogramsToGrams`: `Number('1.1') * 100`
 * no da 110 exacto en todos los valores.
 */
export function parsePoundsToCentipounds(pounds: string): number {
  const groups = POUNDS_PATTERN.exec(pounds)?.groups;
  if (groups?.whole === undefined) {
    throw new RangeError(`Peso en libras fuera de formato: "${pounds}"`);
  }

  const centipounds =
    Number(groups.whole) * CENTIPOUNDS_PER_POUND + Number((groups.fraction ?? '').padEnd(2, '0'));
  assertCentipounds(centipounds);
  return centipounds;
}

/** 10025 → "100.25": siempre dos decimales, como el peso en kilos del contrato. */
export function formatCentipoundsAsPounds(centipounds: number): string {
  assertCentipounds(centipounds);
  const fraction = centipounds % CENTIPOUNDS_PER_POUND;
  // El numerador es múltiplo exacto de 100, así que la división no pierde precisión.
  const whole = (centipounds - fraction) / CENTIPOUNDS_PER_POUND;
  return `${String(whole)}.${String(fraction).padStart(2, '0')}`;
}

/** Cociente entero redondeado al más cercano, al alza en el empate; solo para no negativos. */
function divideRoundingHalfUp(numerator: number, denominator: number): number {
  // `%` es exacto entre enteros seguros, así que el cociente sale sin pasar por una división inexacta.
  const remainder = numerator % denominator;
  const quotient = (numerator - remainder) / denominator;
  return remainder * 2 >= denominator ? quotient + 1 : quotient;
}

function assertCentipounds(centipounds: number): void {
  assertNonNegativeInteger(centipounds, 'Centésimas de libra');
  if (centipounds > MAX_CENTIPOUNDS) {
    throw new RangeError(`Peso en libras fuera de rango: ${String(centipounds)}`);
  }
}

function assertNonNegativeInteger(value: number, description: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${description} no válidos: ${String(value)}`);
  }
}

function assertSafe(product: number, value: number): void {
  if (!Number.isSafeInteger(product)) {
    throw new RangeError(`Cantidad demasiado grande para convertir: ${String(value)}`);
  }
}
