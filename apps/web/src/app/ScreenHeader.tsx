import type { ReactNode } from 'react';
import { Link } from 'react-router';
import styles from './ScreenHeader.module.css';

export interface BackLink {
  readonly to: string;
  readonly label: string;
}

export interface ScreenHeaderProps {
  readonly title: string;
  readonly subtitle?: string | undefined;
  readonly action?: ReactNode;
  /** Enlace de vuelta a la pantalla de la que se viene, para las que cuelgan de una pestaña. */
  readonly backTo?: BackLink;
}

/** Cabecera de cada pantalla: título grande y, si hace falta, una acción a la derecha. */
export function ScreenHeader({ title, subtitle, action, backTo }: ScreenHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.text}>
        {backTo !== undefined && (
          <Link to={backTo.to} className={styles.back}>
            <span aria-hidden="true">‹</span> {backTo.label}
          </Link>
        )}
        <h1 className={styles.title}>{title}</h1>
        {subtitle !== undefined && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {action !== undefined && <div className={styles.action}>{action}</div>}
    </header>
  );
}
