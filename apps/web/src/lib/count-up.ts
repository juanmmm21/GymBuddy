import { motionDuration } from '../design/tokens';

/**
 * Lo que tarda una cifra en llegar a su valor. Dura más que un desplazamiento (120–200 ms) porque
 * aquí lo que se lee es el número y no el movimiento: con menos, los dígitos pasan tan deprisa que
 * no se cuenta nada, solo parpadea.
 */
export const COUNT_UP_DURATION_MS = motionDuration.slow;

/**
 * El número que enseña una cifra que va de `from` a `to` cuando lleva `elapsedMs` contando. Es
 * pura: el reloj lo pone quien la llama, así que se puede comprobar fotograma a fotograma.
 *
 * Arranca deprisa y frena al llegar, para que el valor final se asiente en vez de aparecer de
 * golpe. Sirve igual hacia abajo (una racha que se pierde), aunque lo normal sea subir.
 */
export function countUpValue(
  from: number,
  to: number,
  elapsedMs: number,
  durationMs: number = COUNT_UP_DURATION_MS,
): number {
  if (durationMs <= 0 || elapsedMs >= durationMs) return to;
  if (elapsedMs <= 0) return from;

  const progress = elapsedMs / durationMs;
  const eased = 1 - (1 - progress) ** 3;
  return Math.round(from + (to - from) * eased);
}
