/**
 * Qué discos van en cada lado de la barra para un peso. Es aritmética entera en gramos, como todo
 * peso del proyecto: 82,5 kg son 82 500 g y nunca 82.49999. La PWA lo dibuja en cada serie de un
 * ejercicio con barra para no tener que hacer la cuenta con la barra delante.
 */

/** La barra olímpica de competición. Las de Smith o la Z pesan otra cosa y no se dibujan. */
export const OLYMPIC_BAR_GRAMS = 20_000;

/** Los discos de un gimnasio, del más pesado al más ligero. */
export const PLATE_GRAMS = [25_000, 20_000, 15_000, 10_000, 5_000, 2_500, 1_250] as const;

export type PlateGrams = (typeof PLATE_GRAMS)[number];

export interface BarbellLoad {
  /** Los discos de un lado, del más pesado (junto al tope) al más ligero. */
  readonly perSide: readonly PlateGrams[];
  /**
   * Lo que no se puede cargar exacto con esos discos, en total y no por lado. Un 81 kg deja
   * 1 kg: se enseña, no se redondea en silencio, porque el peso apuntado es el que es.
   */
  readonly remainderGrams: number;
}

/**
 * Los discos de un peso total sobre una barra. `null` si el peso no llega a la barra: una serie
 * de 15 kg no es una barra olímpica cargada, y dibujarla vacía diría algo falso.
 *
 * El reparto es voraz, del disco más pesado al más ligero. Con esta serie de discos coincide con
 * el que usa menos discos, que es como se carga en un gimnasio.
 */
export function barbellLoad(
  totalGrams: number,
  barGrams: number = OLYMPIC_BAR_GRAMS,
): BarbellLoad | null {
  if (!Number.isInteger(totalGrams) || !Number.isInteger(barGrams) || totalGrams < barGrams) {
    return null;
  }

  let side = Math.floor((totalGrams - barGrams) / 2);
  const perSide: PlateGrams[] = [];

  for (const plate of PLATE_GRAMS) {
    while (side >= plate) {
      perSide.push(plate);
      side -= plate;
    }
  }

  const loadedGrams = barGrams + 2 * perSide.reduce((sum, plate) => sum + plate, 0);

  return { perSide, remainderGrams: totalGrams - loadedGrams };
}
