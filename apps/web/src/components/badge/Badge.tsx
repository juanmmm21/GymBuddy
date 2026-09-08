import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';
import styles from './Badge.module.css';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export interface BadgeProps {
  readonly children: ReactNode;
  readonly tone?: BadgeTone;
  readonly className?: string;
}

/** Etiqueta corta: un peso habitual, un "en curso", un recuento. */
export function Badge({ children, tone = 'neutral', className }: BadgeProps) {
  return <span className={cx(styles.badge, toneClass[tone], className)}>{children}</span>;
}

const toneClass: Readonly<Record<BadgeTone, string | undefined>> = {
  neutral: styles.neutral,
  accent: styles.accent,
  success: styles.success,
  warning: styles.warning,
  danger: styles.danger,
};
