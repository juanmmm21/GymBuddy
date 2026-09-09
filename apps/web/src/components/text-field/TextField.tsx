import { useId, type ChangeEvent } from 'react';
import styles from './TextField.module.css';

export interface TextFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Límite del contrato; se enseña el recuento para que no sorprenda al guardar. */
  readonly maxLength?: number;
  readonly placeholder?: string;
  readonly hint?: string;
  readonly disabled?: boolean;
}

/** Texto corto de una línea: el nombre de un ejercicio propio. */
export function TextField({
  label,
  value,
  onChange,
  maxLength,
  placeholder,
  hint,
  disabled = false,
}: TextFieldProps) {
  const inputId = useId();
  const hintId = useId();

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onChange(event.target.value);
  };

  return (
    <div className={styles.field}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
      </label>
      <input
        id={inputId}
        type="text"
        className={styles.input}
        value={value}
        onChange={handleChange}
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={disabled}
        aria-describedby={hint !== undefined ? hintId : undefined}
      />
      {hint !== undefined && (
        <span id={hintId} className={styles.hint}>
          {hint}
        </span>
      )}
    </div>
  );
}
