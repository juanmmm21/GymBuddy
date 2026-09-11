import {
  formatGramsAsKilograms,
  logSetRequestSchema,
  parseKilogramsToGrams,
  roundGramsToApiPrecision,
  rpeToTenths,
} from '@gymbuddy/shared';
import { normalizeSearchText } from '../catalog/snapshot';

/**
 * Una serie tal y como la teclea alguien entre series: `banca 80x8`, `press militar 40 x 10`,
 * `sentadilla 100x5 rpe8`, `cal banca 40x10`.
 * El parser no sabe nada de ejercicios seguidos ni del catálogo: devuelve el nombre escrito y
 * los números ya validados, y resolver ese nombre contra los ejercicios del usuario es cosa
 * del handler. Así la gramática se prueba entera sin base de datos.
 */
export interface ParsedSet {
  /** El nombre como se escribió, sin espacios de sobra: para contestar con sus palabras. */
  readonly exerciseText: string;
  /** El mismo nombre normalizado igual que `search_text` (minúsculas, sin acentos): para buscar. */
  readonly exerciseQuery: string;
  readonly weightGrams: number;
  readonly reps: number;
  /** En décimas, como `set_entry.rpe_tenths`: 85 es RPE 8,5. */
  readonly rpeTenths: number | null;
  readonly isWarmup: boolean;
}

/**
 * Por qué un mensaje no es una serie. Cada motivo existe para poder contestar algo útil: no
 * es lo mismo un «hola» que un `banca 80` al que le faltan las repeticiones.
 */
export type SetParseFailure =
  /** Ni una cifra: es conversación, no un intento de serie. */
  | { readonly reason: 'not_a_set' }
  /** Hay números, pero no la forma peso × repeticiones: `banca 80`, `banca 80 8`. */
  | { readonly reason: 'incomplete_set' }
  | { readonly reason: 'missing_exercise' }
  /** Más de un bloque peso × repeticiones: el bot registra una serie por mensaje. */
  | { readonly reason: 'multiple_sets' }
  | { readonly reason: 'invalid_weight'; readonly text: string }
  | { readonly reason: 'invalid_reps'; readonly text: string }
  /** Fuera de 1 a 10, sin paso de media unidad o sin número: `rpe 11`, `rpe 8,3`, `rpe`. */
  | { readonly reason: 'invalid_rpe'; readonly text: string }
  /** Texto que sobra alrededor de la serie y que no es un RPE ni una marca de calentamiento. */
  | { readonly reason: 'unexpected_text'; readonly text: string };

export type SetMessageParse =
  | { readonly kind: 'set'; readonly set: ParsedSet }
  | { readonly kind: 'rejected'; readonly failure: SetParseFailure };

type Step<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: SetParseFailure };

const NUMBER = String.raw`\d+(?:[.,]\d+)?`;
const UNIT = String.raw`(?:kgs?|kilos?)`;

/**
 * El bloque de la serie: un peso opcional, el separador y las repeticiones. Sin peso
 * (`dominadas x10`) es peso corporal. La unidad puede ir pegada o suelta tras el peso; tras
 * las repeticiones también se captura, pero solo para rechazarla (ver `orderNumbers`).
 * «por» está porque es lo que escribe el dictado del móvil cuando se dice «ochenta por ocho».
 * Delante no puede haber una letra ni una cifra: `extensionx10` o el `0x8` de dentro de
 * `80x8` no son un bloque.
 */
const SET_BLOCK = new RegExp(
  String.raw`(?<![\p{L}\p{N}.,])` +
    String.raw`(?:(?<left>${NUMBER})\s*${UNIT}?\s*)?` +
    String.raw`(?:[x×*]|\bpor\b)\s*` +
    String.raw`(?<right>${NUMBER})(?:\s*(?<rightUnit>${UNIT})(?!\p{L}))?` +
    String.raw`(?!\p{N})`,
  'giu',
);

/**
 * Datos de la serie que se quedan en el nombre. Un peso con su unidad pasa con
 * `banca 60kg 3x10`, que es la notación de series × repeticiones: sin esta comprobación se
 * registrarían 3 kg × 10 en un ejercicio llamado «banca 60kg». Un RPE delante de la serie
 * acabaría igual dentro del nombre. Mejor rechazarlo que guardar un dato falso.
 */
const STRAY_SET_DATA = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(?:${NUMBER}\s*${UNIT}(?!\p{L})|(?:rpe|@)\s*${NUMBER})`,
  'iu',
);

/** `rpe8`, `rpe8,5` y `@8` en una palabra; `rpe 8` llega en dos y se junta al leerlo. */
const RPE_WORD = new RegExp(String.raw`^(?:rpe|@)(?<value>${NUMBER})?$`, 'iu');
const RPE_VALUE = new RegExp(String.raw`^${NUMBER}$`, 'u');

/**
 * La marca de calentamiento es una palabra suelta, delante o detrás de la serie. Va por
 * palabra entera para que un nombre que la contenga («calf raise») no se lea como tal.
 */
const WARMUP_WORD = /^(?:cal|calent|calentamiento|warm-?up)$/iu;

const TRAILING_PUNCTUATION = /[.!?]+$/u;
const EDGE_PUNCTUATION = /^[\s:;,.\-–—]+|[\s:;,.\-–—]+$/gu;

export function parseSetMessage(text: string): SetMessageParse {
  const message = text.replace(/\s+/gu, ' ').trim().replace(TRAILING_PUNCTUATION, '').trim();
  if (!/\d/u.test(message)) return rejected({ reason: 'not_a_set' });

  const blocks = [...message.matchAll(SET_BLOCK)];
  const block = blocks[0];
  if (block === undefined) return rejected({ reason: 'incomplete_set' });
  if (blocks.length > 1) return rejected({ reason: 'multiple_sets' });

  const numbers = orderNumbers(block.groups ?? {});
  if (numbers === null) return rejected({ reason: 'incomplete_set' });

  const weightGrams = parseWeightGrams(numbers.weight);
  if (weightGrams === null) return rejected({ reason: 'invalid_weight', text: numbers.weight });

  const reps = parseReps(numbers.reps);
  if (reps === null) return rejected({ reason: 'invalid_reps', text: numbers.reps });

  const modifiers = parseModifiers(message.slice(block.index + block[0].length));
  if (!modifiers.ok) return { kind: 'rejected', failure: modifiers.failure };

  // El nombre se comprueba lo último: con los números ya válidos, un `80x8` sin ejercicio es
  // exactamente «faltó el nombre», que es lo que el handler puede querer tratar aparte.
  const name = parseExerciseName(message.slice(0, block.index));
  if (!name.ok) return { kind: 'rejected', failure: name.failure };

  return {
    kind: 'set',
    set: {
      exerciseText: name.value.text,
      exerciseQuery: name.value.query,
      weightGrams,
      reps,
      rpeTenths: modifiers.value.rpeTenths,
      isWarmup: name.value.isWarmup || modifiers.value.isWarmup,
    },
  };
}

interface SetNumbers {
  readonly weight: string;
  readonly reps: string;
}

function orderNumbers(groups: Partial<Record<string, string>>): SetNumbers | null {
  const { left, right, rightUnit } = groups;
  if (right === undefined) return null;

  // La unidad detrás no se interpreta. `8x80kg` querría decir 80 kg × 8, pero `80x8 kg` es
  // alguien que añadió la unidad al final pensando en los 80: leer cualquiera de los dos al
  // revés guarda una serie falsa sin avisar, y es preferible pedir que se repita.
  if (rightUnit !== undefined) return null;

  return left === undefined ? { weight: '0', reps: right } : { weight: left, reps: right };
}

/**
 * Mismo camino que el campo de peso de la PWA: la coma del teclado español pasa a punto, se
 * convierte operando sobre la cadena y se redondea a los 10 g que representa el contrato.
 */
function parseWeightGrams(text: string): number | null {
  try {
    const grams = roundGramsToApiPrecision(parseKilogramsToGrams(text.replace(',', '.')));
    // Un «9999,999» redondea a 10000 kg, que ya no cabe en el contrato: se descubre aquí
    // formateándolo y no cuando el Worker lo rechace con la serie a medio registrar.
    formatGramsAsKilograms(grams);
    return grams;
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

/** El tope de repeticiones es el del contrato del registro, no uno copiado aquí. */
function parseReps(text: string): number | null {
  if (!/^\d+$/u.test(text)) return null;

  const reps = Number(text);
  return logSetRequestSchema.shape.reps.safeParse(reps).success ? reps : null;
}

/**
 * `rpeToTenths` es la misma regla que el `CHECK` de `set_entry`: de 1 a 10 en pasos de media
 * unidad. Pasar por `Number` es seguro aquí porque rechaza todo lo que no sea un medio punto
 * exacto, así que ningún residuo de coma flotante llega a guardarse.
 */
function parseRpeTenths(text: string): number | null {
  try {
    return rpeToTenths(Number(text.replace(',', '.')));
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

interface Modifiers {
  readonly rpeTenths: number | null;
  readonly isWarmup: boolean;
}

/** Lo que va tras la serie: un RPE como mucho y la marca de calentamiento, en cualquier orden. */
function parseModifiers(trailing: string): Step<Modifiers> {
  const pending = trailing
    .split(' ')
    .map(trimPunctuation)
    .filter((word) => word !== '');
  let rpeTenths: number | null = null;
  let isWarmup = false;

  for (let word = pending.shift(); word !== undefined; word = pending.shift()) {
    if (WARMUP_WORD.test(word)) {
      isWarmup = true;
      continue;
    }

    const rpe = RPE_WORD.exec(word);
    if (rpe === null || rpeTenths !== null) {
      return { ok: false, failure: { reason: 'unexpected_text', text: word } };
    }

    let value = rpe.groups?.value;
    let text = word;
    const next = pending[0];
    if (value === undefined && next !== undefined && RPE_VALUE.test(next)) {
      value = next;
      text = `${word} ${next}`;
      pending.shift();
    }

    const tenths = value === undefined ? null : parseRpeTenths(value);
    if (tenths === null) return { ok: false, failure: { reason: 'invalid_rpe', text } };
    rpeTenths = tenths;
  }

  return { ok: true, value: { rpeTenths, isWarmup } };
}

interface ExerciseName {
  readonly text: string;
  readonly query: string;
  readonly isWarmup: boolean;
}

function parseExerciseName(namePart: string): Step<ExerciseName> {
  const words = namePart.split(' ');
  const kept = words.filter((word) => !WARMUP_WORD.test(trimPunctuation(word)));
  const text = trimPunctuation(kept.join(' '));

  const stray = STRAY_SET_DATA.exec(text);
  if (stray !== null) {
    return { ok: false, failure: { reason: 'unexpected_text', text: stray[0] } };
  }

  const query = normalizeSearchText(text);
  if (query === '') return { ok: false, failure: { reason: 'missing_exercise' } };

  return { ok: true, value: { text, query, isWarmup: kept.length !== words.length } };
}

function trimPunctuation(text: string): string {
  return text.replace(EDGE_PUNCTUATION, '');
}

function rejected(failure: SetParseFailure): SetMessageParse {
  return { kind: 'rejected', failure };
}
