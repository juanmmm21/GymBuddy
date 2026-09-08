/**
 * Une nombres de clase descartando los vacíos. Los módulos CSS se tipan como
 * `string | undefined` por `noUncheckedIndexedAccess`, y una interpolación directa
 * escribiría "undefined" literal en el atributo `class`.
 */
export function cx(...classes: ReadonlyArray<string | false | null | undefined>): string {
  return classes
    .filter((value): value is string => typeof value === 'string' && value !== '')
    .join(' ');
}
