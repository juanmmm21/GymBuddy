/**
 * Alfabeto base32 de Crockford: sin I, L, O ni U. Un código de acceso se copia de un mensaje o
 * se teclea mirando la pantalla de otro móvil, y ahí la I y el 1, o la O y el 0, se confunden.
 */
export const ACCESS_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Doce símbolos de treinta y dos posibles son 60 bits: no se adivinan a base de probar. */
export const INVITATION_CODE_LENGTH = 12;

/**
 * El de «añadir otro dispositivo» es más corto porque se teclea a mano mirando otra pantalla,
 * sin poder copiarlo. Ocho símbolos son 40 bits, y vive diez minutos y un solo uso: probar al
 * azar durante esa ventana no llega a ninguna parte.
 */
export const DEVICE_LINK_CODE_LENGTH = 8;

const DISPLAY_GROUP_LENGTH = 4;

/** La forma canónica de un código de esa longitud, que es la única que se guarda y se compara. */
export function accessCodePattern(length: number): RegExp {
  return new RegExp(`^[${ACCESS_CODE_ALPHABET}]{${String(length)}}$`);
}

export const INVITATION_CODE_PATTERN = accessCodePattern(INVITATION_CODE_LENGTH);
export const DEVICE_LINK_CODE_PATTERN = accessCodePattern(DEVICE_LINK_CODE_LENGTH);

/**
 * Lleva lo tecleado a la forma canónica sin decidir si es válido: mayúsculas, fuera espacios y
 * guiones (también los largos que pone el corrector de un chat), y las letras que Crockford lee
 * como cifras cambiadas por ellas (O → 0, I y L → 1). Quien copia «abcd-efgh-jkmn» o escribe una
 * O en lugar de un cero tiene que poder entrar igual.
 */
export function compactAccessCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[\s\-‐-―]+/g, '')
    .replaceAll('O', '0')
    .replace(/[IL]/g, '1');
}

/** Si una cadena ya canónica es un código posible de esa longitud. No dice si existe. */
export function isAccessCode(code: string, length: number): boolean {
  return accessCodePattern(length).test(code);
}

/** «ABCD-EFGH-JKMN»: de cuatro en cuatro se lee y se teclea sin perder la cuenta. */
export function formatAccessCode(code: string): string {
  const groups: string[] = [];
  for (let start = 0; start < code.length; start += DISPLAY_GROUP_LENGTH) {
    groups.push(code.slice(start, start + DISPLAY_GROUP_LENGTH));
  }

  return groups.join('-');
}
