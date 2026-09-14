/**
 * Si un ejercicio va con barra olímpica de 20 kg y tiene sentido dibujar sus discos. Solo
 * `barbell`: la Smith, la barra Z o una máquina tienen otra barra o no la tienen, y un ejercicio
 * propio no dice su equipamiento, así que dibujar ahí diría un peso de discos que no es.
 */
export function usesOlympicBar(equipment: string | null): boolean {
  return equipment === 'barbell';
}
