import { useId } from 'react';
import { cx } from '../../lib/cx';
import styles from './Switch.module.css';

export interface SwitchProps {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  /** Lo que cambia al activarlo, dicho debajo de la etiqueta. */
  readonly hint?: string;
  readonly disabled?: boolean;
}

/**
 * Un interruptor de sí o no: «A un brazo». La fila entera es el botón, porque en el gimnasio se
 * pulsa con el pulgar y la bolita sola es un blanco demasiado pequeño. Se anuncia como `switch`
 * con su etiqueta como nombre y la explicación como descripción, no todo junto.
 */
export function Switch({ label, checked, onChange, hint, disabled = false }: SwitchProps) {
  const labelId = useId();
  const hintId = useId();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelId}
      aria-describedby={hint !== undefined ? hintId : undefined}
      className={styles.switch}
      disabled={disabled}
      onClick={() => {
        onChange(!checked);
      }}
    >
      <span className={styles.text}>
        <span id={labelId} className={styles.label}>
          {label}
        </span>
        {hint !== undefined && (
          <span id={hintId} className={styles.hint}>
            {hint}
          </span>
        )}
      </span>
      <span className={cx(styles.track, checked && styles.trackOn)} aria-hidden="true">
        <span className={cx(styles.thumb, checked && styles.thumbOn)} />
      </span>
    </button>
  );
}
