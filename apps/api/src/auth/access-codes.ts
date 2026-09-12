import { ACCESS_CODE_ALPHABET } from '@gymbuddy/shared';

/**
 * Un código de acceso nuevo, del largo que se pida. Treinta y dos símbolos reparten los 256
 * valores de un byte en partes exactas (ocho cada uno), así que el resto de dividir no favorece
 * a ningún símbolo.
 */
export function generateAccessCode(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));

  return Array.from(bytes, (byte) =>
    ACCESS_CODE_ALPHABET.charAt(byte % ACCESS_CODE_ALPHABET.length),
  ).join('');
}
