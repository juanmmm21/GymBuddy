import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../../lib/cx';
import styles from './Surface.module.css';

export type SurfacePadding = 'none' | 'md' | 'lg';

export interface SurfaceProps extends HTMLAttributes<HTMLElement> {
  readonly children: ReactNode;
  /** Con sombra: para lo que flota sobre la página, no para las tarjetas de una lista. */
  readonly raised?: boolean;
  readonly padding?: SurfacePadding;
  /** Elemento HTML que se pinta; una tarjeta de lista es un `li`, una sección es `section`. */
  readonly as?: 'div' | 'section' | 'article' | 'li';
}

/** Bloque de contenido apoyado sobre el fondo: la unidad básica de toda pantalla. */
export function Surface({
  children,
  raised = false,
  padding = 'md',
  as: Tag = 'div',
  className,
  ...rest
}: SurfaceProps) {
  return (
    <Tag
      className={cx(styles.surface, raised && styles.raised, paddingClass[padding], className)}
      {...rest}
    >
      {children}
    </Tag>
  );
}

const paddingClass: Readonly<Record<SurfacePadding, string | undefined>> = {
  none: styles.paddingNone,
  md: styles.paddingMd,
  lg: styles.paddingLg,
};
