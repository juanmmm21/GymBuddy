import type { CSSProperties } from 'react';
import { motionDuration } from '../../design/tokens';
import { cx } from '../../lib/cx';
import styles from './list-entrance.module.css';

/**
 * Cuántas tarjetas entran una detrás de otra antes de que el retraso se quede fijo. Sin tope, una
 * página de cincuenta ejercicios del catálogo tardaría dos segundos en acabar de pintarse; con él,
 * se lee que la lista cae en orden y lo que hay más abajo llega junto, que es donde ya no se mira.
 */
export const LIST_ENTRANCE_MAX_STEP = 5;

/**
 * El retraso con el que entra la tarjeta que ocupa esa posición, en milisegundos. Es pura y es lo
 * que fija el tope: una posición más allá del tope entra con el mismo retraso que la del tope.
 */
export function listEntranceDelayMs(index: number): number {
  if (!Number.isFinite(index)) return 0;
  const step = Math.min(Math.max(Math.trunc(index), 0), LIST_ENTRANCE_MAX_STEP);
  return step * motionDuration.stagger;
}

/**
 * Lo que se le pone a una tarjeta de lista para que entre en su turno. El retraso va en el `style`
 * y no en una clase porque depende de la posición: es un valor calculado desde el token del paso,
 * no un literal de diseño escrito a mano.
 *
 * Solo anima al montarse. Una lista que se relee con las mismas claves no se mueve, y una página
 * nueva («Cargar más») entra ella sola sin tocar lo que ya estaba.
 */
export function listEntranceProps(index: number): {
  readonly className: string;
  readonly style: CSSProperties;
} {
  return {
    className: cx(styles.item),
    style: { animationDelay: `${String(listEntranceDelayMs(index))}ms` },
  };
}
