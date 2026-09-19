/**
 * Cuánto hay que arrastrar la hoja hacia abajo, en píxeles, para que al soltar se cierre. Es más
 * que el recorrido de un pulgar distraído y menos de lo que mide la hoja: el gesto se completa sin
 * llegar al final de la pantalla, que entre serie y serie es lo que se hace con una mano.
 */
export const SHEET_DRAG_CLOSE_DISTANCE = 96;

/**
 * Un empujón rápido cierra aunque no llegue a la distancia, en píxeles por milisegundo. Es la
 * diferencia entre apartar la hoja de un manotazo y bajarla despacio para leerla.
 */
export const SHEET_FLICK_VELOCITY = 0.6;

/** Por debajo de esto no hay gesto que valga: un toque en la cabecera no puede cerrar la hoja. */
export const SHEET_FLICK_DISTANCE = 24;

/** Lo que pasa con la hoja al levantar el dedo. */
export type SheetDragOutcome = 'close' | 'stay';

export interface SheetDragGesture {
  /** Lo recorrido hacia abajo desde donde empezó el dedo, en píxeles. */
  readonly distance: number;
  /** Lo que duró el gesto, en milisegundos. */
  readonly elapsedMs: number;
}

/**
 * Cuánto se mueve la hoja con el dedo. Hacia abajo acompaña al dedo; hacia arriba no se despega,
 * porque arriba no hay nada que enseñar y una hoja que se estira se lee como un fallo.
 */
export function sheetDragOffset(deltaY: number): number {
  return Number.isFinite(deltaY) ? Math.max(deltaY, 0) : 0;
}

/**
 * Si el gesto cierra la hoja o la devuelve a su sitio. Pura: decide con lo recorrido y con lo que
 * se tardó, sin mirar el DOM.
 */
export function sheetDragOutcome({ distance, elapsedMs }: SheetDragGesture): SheetDragOutcome {
  if (!Number.isFinite(distance) || distance <= 0) return 'stay';
  if (distance >= SHEET_DRAG_CLOSE_DISTANCE) return 'close';
  if (distance < SHEET_FLICK_DISTANCE) return 'stay';

  // Un gesto sin tiempo medible (dos eventos en el mismo milisegundo) no se toma por un manotazo:
  // dividir por cero daría velocidad infinita y cerraría cualquier roce.
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 'stay';
  return distance / elapsedMs >= SHEET_FLICK_VELOCITY ? 'close' : 'stay';
}
