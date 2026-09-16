/**
 * Si un ejercicio va con barra olímpica de 20 kg y tiene sentido dibujar sus discos. Solo
 * `barbell`: la Smith, la barra Z o una máquina tienen otra barra o no la tienen, y un ejercicio
 * propio no dice su equipamiento, así que dibujar ahí diría un peso de discos que no es.
 */
export function usesOlympicBar(equipment: string | null): boolean {
  return equipment === 'barbell';
}

/**
 * Si se dibujan los discos de las series de un ejercicio. Uno a un brazo no, aunque el catálogo diga
 * barra: su peso es el de un brazo (un remo en landmine), y repartirlo en discos a los dos lados de
 * una barra olímpica dibujaría una carga que no existe.
 */
export function drawsPlates(exercise: {
  readonly equipment: string | null;
  readonly unilateral: boolean;
}): boolean {
  return !exercise.unilateral && usesOlympicBar(exercise.equipment);
}
