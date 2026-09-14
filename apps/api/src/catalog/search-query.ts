import type { BodyPart } from '@gymbuddy/shared';
import { normalizeSearchText } from './snapshot';

/**
 * Tope de palabras que se tienen en cuenta al buscar. D1 admite cien parámetros por
 * consulta y cada palabra gasta hasta dos (el `LIKE` y la parte del cuerpo) en cada una de las
 * dos lecturas de la consulta: nadie escribe seis palabras en el buscador del gimnasio, y así
 * una consulta absurda no puede tumbar la petición.
 */
export const MAX_SEARCH_TERMS = 6;

/** Una palabra de la consulta, lista para compararla con `search_text`. */
export interface SearchTerm {
  /** Se busca como subcadena de `search_text`, ya en singular aproximado. */
  readonly text: string;
  /** La parte del cuerpo que nombra esa palabra, si nombra alguna: casa también por columna. */
  readonly bodyPart: BodyPart | null;
}

/** Una forma de leer la consulta. Un ejercicio casa con ella si casa con todas sus palabras. */
export type SearchVariant = readonly SearchTerm[];

/**
 * Nombres de gimnasio que el catálogo no usa, con las palabras con las que sí los nombra. Es
 * corto a propósito y cada destino está comprobado contra el tag del catálogo: un alias que
 * apunta a palabras que no existen no encuentra nada y además esconde el fallo. Van ya
 * normalizados (minúsculas, sin acentos); el singular se lo aplica `planCatalogSearch`.
 */
const SEARCH_ALIASES: readonly (readonly [alias: string, catalogWords: string])[] = [
  // El catálogo no tiene «face pull»: lo más cercano es el remo de deltoides posterior con cuerda.
  ['face pull', 'deltoides posterior cuerda'],
  ['facepull', 'deltoides posterior cuerda'],
  ['rdl', 'peso muerto rumano'],
  ['pec deck', 'apertura maquina'],
  ['peck deck', 'apertura maquina'],
  ['contractora', 'apertura maquina'],
  ['remo gironda', 'remo sentado polea'],
  ['gironda', 'remo sentado polea'],
  ['sentadilla bulgara', 'split squat'],
  ['bulgarian split squat', 'split squat'],
  ['curl scott', 'curl predicador'],
  ['banco scott', 'predicador'],
  ['cruce de poleas', 'crossover'],
  ['cruce poleas', 'crossover'],
  ['pajaros', 'apertura inversa'],
  ['rear delt fly', 'apertura inversa'],
  ['paseo del granjero', 'farmers'],
  ['paseo granjero', 'farmers'],
  ['hiperextension', 'hyperextension'],
  ['hip thrust', 'puente gluteo'],
  ['pull over', 'pullover'],
  // La máquina se llama por el músculo; el catálogo, por el movimiento.
  ['abductor', 'abduccion'],
  ['aductor', 'aduccion'],
  ['adductor', 'aduccion'],
];

/**
 * Las palabras con las que se nombra una parte del cuerpo, ya en singular. Casan con la
 * columna `body_part` además de con el nombre: «espalda polea» tiene que encontrar un remo en
 * polea aunque su nombre no diga «espalda».
 */
const BODY_PART_WORDS: ReadonlyMap<string, BodyPart> = new Map<string, BodyPart>([
  ['espalda', 'back'],
  ['back', 'back'],
  ['pecho', 'chest'],
  ['chest', 'chest'],
  ['pierna', 'legs'],
  ['leg', 'legs'],
  ['brazo', 'arms'],
  ['arm', 'arms'],
  ['hombro', 'shoulders'],
  ['shoulder', 'shoulders'],
  ['core', 'core'],
  ['abdomen', 'core'],
  ['abdominal', 'core'],
  ['cardio', 'cardio'],
]);

/** Los alias partidos en palabras en singular, del más largo al más corto: gana el más concreto. */
const ALIAS_RULES: readonly { readonly from: readonly string[]; readonly to: readonly string[] }[] =
  SEARCH_ALIASES.map(([alias, catalogWords]) => ({
    from: singularWords(alias),
    to: singularWords(catalogWords),
  })).sort((left, right) => right.from.length - left.from.length);

/**
 * Parte la consulta en palabras normalizadas igual que `search_text`. Es pura y va aparte
 * porque es la mitad del comportamiento de la búsqueda y se prueba sin base de datos.
 */
export function buildSearchTerms(query: string): string[] {
  const normalized = normalizeSearchText(query);
  if (normalized === '') return [];

  // La normalización ya deja fuera `%` y `_`, así que ningún término puede colarse como
  // comodín dentro del LIKE.
  return [...new Set(normalized.split(' ').filter((term) => term !== ''))].slice(
    0,
    MAX_SEARCH_TERMS,
  );
}

/**
 * Singular aproximado de una palabra, en español y en inglés. No es un lematizador: basta con
 * que el resultado sea un trozo de la palabra buscada, porque la búsqueda es por subcadena y
 * «elevacion» ya está dentro de «elevación» y de «elevaciones». Recortar solo puede añadir
 * resultados, nunca quitarlos; los mínimos de longitud evitan que el trozo case con todo.
 */
export function singularizeSearchTerm(term: string): string {
  if (term.endsWith('es') && term.length - 2 >= 4) return term.slice(0, -2);
  if (term.endsWith('s') && !term.endsWith('ss') && term.length - 1 >= 3) {
    return term.slice(0, -1);
  }
  return term;
}

/**
 * Las formas de leer una consulta: la literal y, si algún alias casa, la traducida a las
 * palabras del catálogo. Se busca cualquiera de las dos, así que un alias añade resultados sin
 * quitarle a nadie los que ya encontraba lo tecleado. Sin palabras, ninguna lectura.
 */
export function planCatalogSearch(query: string): SearchVariant[] {
  const literal = unique(buildSearchTerms(query).map(singularizeSearchTerm));
  if (literal.length === 0) return [];

  const translated = unique(applyAliases(literal)).slice(0, MAX_SEARCH_TERMS);
  const words = translated.join(' ') === literal.join(' ') ? [literal] : [literal, translated];

  return words.map((variant) => variant.map(toSearchTerm));
}

function applyAliases(words: readonly string[]): string[] {
  const result: string[] = [];
  let index = 0;

  while (index < words.length) {
    const rule = ALIAS_RULES.find(({ from }) =>
      from.every((word, offset) => words[index + offset] === word),
    );
    if (rule === undefined) {
      result.push(words[index] ?? '');
      index += 1;
    } else {
      result.push(...rule.to);
      index += rule.from.length;
    }
  }

  return result;
}

function toSearchTerm(text: string): SearchTerm {
  return { text, bodyPart: BODY_PART_WORDS.get(text) ?? null };
}

function singularWords(phrase: string): string[] {
  return normalizeSearchText(phrase).split(' ').map(singularizeSearchTerm);
}

function unique(words: readonly string[]): string[] {
  return [...new Set(words)];
}
