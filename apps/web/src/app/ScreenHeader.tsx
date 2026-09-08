import type { ReactNode } from 'react';
import styles from './ScreenHeader.module.css';

export interface ScreenHeaderProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly action?: ReactNode;
}

/** Cabecera de cada pestaña: título grande y, si hace falta, una acción a la derecha. */
export function ScreenHeader({ title, subtitle, action }: ScreenHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.text}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle !== undefined && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {action !== undefined && <div className={styles.action}>{action}</div>}
    </header>
  );
}
