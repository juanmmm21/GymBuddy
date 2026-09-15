/**
 * Filtros de equipamiento que reúnen varias etiquetas del catálogo bajo un nombre. En el tag
 * `v1.1.0` la etiqueta `machine` solo tiene siete ejercicios (elíptica, cinta, un jalón…): las
 * máquinas de un gimnasio están repartidas en `lever` (78), `smith` (48, la multipower) y `sled`
 * (12, prensas). Filtrar «Máquina» por la etiqueta literal dejaba casi todas las partes del cuerpo
 * vacías (contado contra el CDN el 2026-09-15). El grupo vive en el contrato, y no como una lista
 * libre en la petición, para que la PWA no reparta etiquetas del tag y la consulta gaste un número
 * fijo y pequeño de parámetros de D1.
 */
export const EQUIPMENT_FILTER_GROUPS: Readonly<Record<string, readonly string[]>> = {
  machine: ['machine', 'lever', 'smith', 'sled'],
};

/**
 * Las etiquetas del catálogo que abarca un filtro de equipamiento: las del grupo si lo es, y si
 * no, la propia etiqueta. Un grupo usa el nombre de una de sus etiquetas a propósito: los enlaces
 * viejos con `equipment=machine` pasan a encontrar las máquinas sin cambiar la URL.
 */
export function equipmentTagsOfFilter(equipment: string): readonly string[] {
  return EQUIPMENT_FILTER_GROUPS[equipment] ?? [equipment];
}
