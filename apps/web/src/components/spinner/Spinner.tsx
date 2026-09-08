import { cx } from '../../lib/cx';
import styles from './Spinner.module.css';

export type SpinnerSize = 'sm' | 'md';

export interface SpinnerProps {
  readonly size?: SpinnerSize;
  /** Lo que se está esperando, para el lector de pantalla. */
  readonly label?: string;
}

export function Spinner({ size = 'md', label = 'Cargando' }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cx(styles.spinner, size === 'sm' ? styles.sizeSm : styles.sizeMd)}
    />
  );
}
