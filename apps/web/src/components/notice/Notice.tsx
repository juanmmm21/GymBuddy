import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';
import styles from './Notice.module.css';

export type NoticeTone = 'info' | 'success' | 'warning' | 'danger';

export interface NoticeProps {
  readonly title: string;
  readonly children?: ReactNode;
  readonly tone?: NoticeTone;
  /** Normalmente un botón de reintentar; va debajo del texto. */
  readonly action?: ReactNode;
}

/**
 * Aviso en línea: estados vacíos, errores recuperables, explicaciones. Un error de red
 * merece un `danger` con su acción, no una pantalla en blanco.
 */
export function Notice({ title, children, tone = 'info', action }: NoticeProps) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cx(styles.notice, toneClass[tone])}
    >
      <p className={styles.title}>{title}</p>
      {children !== undefined && <div className={styles.body}>{children}</div>}
      {action !== undefined && <div className={styles.action}>{action}</div>}
    </div>
  );
}

const toneClass: Readonly<Record<NoticeTone, string | undefined>> = {
  info: styles.info,
  success: styles.success,
  warning: styles.warning,
  danger: styles.danger,
};
