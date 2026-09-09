import { useId, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { cx } from '../../lib/cx';
import styles from './NumberField.module.css';

export interface NumberFieldProps {
  readonly label: string;
  /** Valor entero, o `null` si el campo está vacío. */
  readonly value: number | null;
  readonly onChange: (value: number | null) => void;
  readonly min?: number;
  readonly max?: number;
  readonly disabled?: boolean;
  readonly hint?: string;
}

const DIGITS = /^\d+$/;

/**
 * Campo de un entero con botones de −1 y +1: las repeticiones de una serie. Como en
 * `WeightField`, lo tecleado se confirma al salir del campo o con Intro y no en cada
 * pulsación, para que escribir "1" de camino a "12" no valga como una repetición.
 */
export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  disabled = false,
  hint,
}: NumberFieldProps) {
  const inputId = useId();
  const messageId = useId();
  // `null` significa "no se está editando": lo que se ve sale del valor de fuera.
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  const shownValue = draft ?? (value === null ? '' : String(value));
  const invalidMessage = `Escribe un número entre ${String(min)} y ${String(max)}`;

  const commit = (): void => {
    const text = (draft ?? shownValue).trim();
    if (text === '') {
      onChange(null);
      setDraft(null);
      setInvalid(false);
      return;
    }

    if (!DIGITS.test(text)) {
      setInvalid(true);
      return;
    }

    const parsed = Number.parseInt(text, 10);
    if (parsed < min || parsed > max) {
      setInvalid(true);
      return;
    }

    onChange(parsed);
    setDraft(null);
    setInvalid(false);
  };

  const nudge = (delta: number): void => {
    const next = (value ?? min) + delta;
    onChange(Math.min(max, Math.max(min, next)));
    setDraft(null);
    setInvalid(false);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setDraft(event.target.value);
    setInvalid(false);
  };

  // Intro solo quita el foco: confirma el `blur`, y así no hay dos confirmaciones.
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  const message = invalid ? invalidMessage : hint;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.stepper}
          onClick={() => {
            nudge(-1);
          }}
          disabled={disabled || (value ?? min) <= min}
          aria-label={`Restar una a ${label.toLowerCase()}`}
        >
          −
        </button>

        <input
          id={inputId}
          className={cx(styles.input, invalid && styles.inputInvalid)}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={shownValue}
          onFocus={() => {
            setDraft(shownValue);
          }}
          onChange={handleChange}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={message !== undefined ? messageId : undefined}
        />

        <button
          type="button"
          className={styles.stepper}
          onClick={() => {
            nudge(1);
          }}
          disabled={disabled || (value ?? min) >= max}
          aria-label={`Sumar una a ${label.toLowerCase()}`}
        >
          +
        </button>
      </div>

      {message !== undefined && (
        <p id={messageId} className={cx(styles.message, invalid && styles.messageInvalid)}>
          {message}
        </p>
      )}
    </div>
  );
}
