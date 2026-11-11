import { cx } from '../../lib/cx';
import { t } from '../../i18n/index';
import styles from './Spinner.module.css';

export type SpinnerSize = 'sm' | 'md';

export interface SpinnerProps {
  readonly size?: SpinnerSize;
  /** Lo que se está esperando, para el lector de pantalla. */
  readonly label?: string;
}

export function Spinner({ size = 'md', label }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label ?? t('Cargando', 'Loading')}
      className={cx(styles.spinner, size === 'sm' ? styles.sizeSm : styles.sizeMd)}
    />
  );
}
