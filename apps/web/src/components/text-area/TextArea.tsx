import { useId, type ChangeEvent } from 'react';
import styles from './TextArea.module.css';

export interface TextAreaProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Límite del contrato; se enseña el recuento para que no sorprenda al guardar. */
  readonly maxLength?: number;
  readonly rows?: number;
  readonly placeholder?: string;
  readonly hint?: string;
  readonly disabled?: boolean;
}

/** Texto libre de varias líneas: las notas de un ejercicio o de una sesión. */
export function TextArea({
  label,
  value,
  onChange,
  maxLength,
  rows = 4,
  placeholder,
  hint,
  disabled = false,
}: TextAreaProps) {
  const inputId = useId();
  const hintId = useId();

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    onChange(event.target.value);
  };

  return (
    <div className={styles.field}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
      </label>
      <textarea
        id={inputId}
        className={styles.input}
        value={value}
        onChange={handleChange}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={disabled}
        aria-describedby={hint !== undefined ? hintId : undefined}
      />
      <div className={styles.footer}>
        {hint !== undefined && (
          <span id={hintId} className={styles.hint}>
            {hint}
          </span>
        )}
        {maxLength !== undefined && (
          <span className={styles.counter} aria-live="polite">
            {value.length}/{maxLength}
          </span>
        )}
      </div>
    </div>
  );
}
