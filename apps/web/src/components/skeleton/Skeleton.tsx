import { cx } from '../../lib/cx';
import styles from './Skeleton.module.css';

export type SkeletonShape = 'title' | 'line' | 'lineShort' | 'badge' | 'thumb';

export interface SkeletonProps {
  readonly shape?: SkeletonShape;
}

/**
 * El hueco que ocupará un trozo de contenido mientras se carga. Es decorativo: quien lo monta se
 * encarga de anunciar la espera una sola vez (ver `SkeletonList`), porque cinco filas de huecos
 * anunciándose una a una serían cinco avisos para el lector de pantalla.
 */
export function Skeleton({ shape = 'line' }: SkeletonProps) {
  return <span aria-hidden="true" className={cx(styles.block, shapeClass[shape])} />;
}

const shapeClass: Readonly<Record<SkeletonShape, string | undefined>> = {
  title: styles.title,
  line: styles.line,
  lineShort: styles.lineShort,
  badge: styles.badge,
  thumb: styles.thumb,
};
