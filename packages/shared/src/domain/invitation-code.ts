/**
 * Alfabeto base32 de Crockford: sin I, L, O ni U. Un código de invitación se copia de un
 * mensaje o se dicta en voz alta, y ahí la I y el 1, o la O y el 0, se confunden.
 */
export const INVITATION_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Doce símbolos de treinta y dos posibles son 60 bits: no se adivinan a base de probar. */
export const INVITATION_CODE_LENGTH = 12;

/** La forma canónica, que es la única que se guarda (su digest) y se compara. */
export const INVITATION_CODE_PATTERN = new RegExp(
  `^[${INVITATION_CODE_ALPHABET}]{${String(INVITATION_CODE_LENGTH)}}$`,
);

const DISPLAY_GROUP_LENGTH = 4;

/**
 * Lleva lo tecleado a la forma canónica sin decidir si es válido: mayúsculas, fuera espacios y
 * guiones (también los largos que pone el corrector de un chat), y las letras que Crockford lee
 * como cifras cambiadas por ellas (O → 0, I y L → 1). Quien copia «abcd-efgh-jkmn» o escribe una
 * O en lugar de un cero tiene que poder registrarse igual.
 */
export function compactInvitationCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[\s\-‐-―]+/g, '')
    .replaceAll('O', '0')
    .replace(/[IL]/g, '1');
}

/** Si una cadena ya canónica es un código posible. No dice si existe. */
export function isInvitationCode(code: string): boolean {
  return INVITATION_CODE_PATTERN.test(code);
}

/** «ABCD-EFGH-JKMN»: de cuatro en cuatro se lee y se teclea sin perder la cuenta. */
export function formatInvitationCode(code: string): string {
  const groups: string[] = [];
  for (let start = 0; start < code.length; start += DISPLAY_GROUP_LENGTH) {
    groups.push(code.slice(start, start + DISPLAY_GROUP_LENGTH));
  }

  return groups.join('-');
}
