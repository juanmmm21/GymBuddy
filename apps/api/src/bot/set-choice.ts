import { resourceIdSchema } from '@gymbuddy/shared';

/**
 * Lo que lleva un botón de elección. Telegram limita `callback_data` a 64 bytes, así que
 * el botón no puede cargar la serie entera: la serie se vuelve a leer del mensaje original,
 * al que responde el mensaje de los botones, y el botón solo dice qué se eligió.
 */
export type SetChoice =
  | { readonly kind: 'tracked'; readonly trackedExerciseId: string }
  /**
   * Un `catalogId` llega a 74 caracteres y no cabe. Va una huella corta que se compara con
   * las opciones que devuelve la misma búsqueda al pulsar: identifica el ejercicio y no su
   * posición, así que una opción que ya no sale no se confunde con la de al lado.
   */
  | { readonly kind: 'catalog'; readonly catalogKey: string };

const PREFIX = 'set';
const TRACKED = 't';
const CATALOG = 'c';
const CATALOG_KEY_PATTERN = /^[0-9a-z]{1,7}$/u;

export function encodeSetChoice(choice: SetChoice): string {
  return choice.kind === 'tracked'
    ? `${PREFIX}:${TRACKED}:${choice.trackedExerciseId}`
    : `${PREFIX}:${CATALOG}:${choice.catalogKey}`;
}

/** `null` para cualquier cosa que no haya escrito este bot: el dato lo manda el cliente. */
export function decodeSetChoice(data: string): SetChoice | null {
  const [prefix, kind, value, ...rest] = data.split(':');
  if (prefix !== PREFIX || value === undefined || rest.length > 0) return null;

  if (kind === TRACKED && resourceIdSchema.safeParse(value).success) {
    return { kind: 'tracked', trackedExerciseId: value };
  }
  if (kind === CATALOG && CATALOG_KEY_PATTERN.test(value)) {
    return { kind: 'catalog', catalogKey: value };
  }

  return null;
}

/**
 * FNV-1a de 32 bits en base 36. No es una defensa: solo tiene que distinguir entre las
 * seis opciones de una misma búsqueda, y quien pulse un dato inventado solo puede elegir
 * entre lo que esa búsqueda ya le ofrecía.
 */
export function catalogChoiceKey(catalogId: string): string {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(catalogId)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(36);
}
