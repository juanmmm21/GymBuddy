import type { Locale } from '@gymbuddy/shared';
import { useId, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { cx } from '../../lib/cx';
import styles from '../number-field/NumberField.module.css';
import { formatDistanceForInput, parseDistanceInput } from './distance-math';

export interface DistanceFieldProps {
  readonly label: string;
  /** Distancia en metros enteros, o `null` si no se anota. */
  readonly valueMeters: number | null;
  readonly onChange: (meters: number | null) => void;
  /** Para la coma de lo que se enseña al editar. */
  readonly locale: Locale;
  readonly disabled?: boolean;
  readonly hint?: string;
}

const INVALID_MESSAGE = 'Escribe los kilómetros, por ejemplo 5,25';

/**
 * La distancia de un cardio, en kilómetros. Es opcional —una elíptica no la marca—, así que vaciar
 * el campo es un valor válido y sin botones: nadie suma distancia de cien en cien metros.
 */
export function DistanceField({
  label,
  valueMeters,
  onChange,
  locale,
  disabled = false,
  hint,
}: DistanceFieldProps) {
  const inputId = useId();
  const messageId = useId();
  // `null` significa "no se está editando": lo que se ve sale del valor de fuera.
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  const shownValue =
    draft ?? (valueMeters === null ? '' : formatDistanceForInput(valueMeters, locale));

  const commit = (): void => {
    const parsed = parseDistanceInput(draft ?? shownValue);
    if (parsed.kind === 'invalid') {
      setInvalid(true);
      return;
    }
    onChange(parsed.kind === 'empty' ? null : parsed.meters);
    setDraft(null);
    setInvalid(false);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setDraft(event.target.value);
    setInvalid(false);
  };

  // Intro solo quita el foco: el `blur` resultante es quien confirma, y así no hay dos confirmaciones.
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  const message = invalid ? INVALID_MESSAGE : hint;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>

      <input
        id={inputId}
        className={cx(styles.input, invalid && styles.inputInvalid)}
        type="text"
        inputMode="decimal"
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

      {message !== undefined && (
        <p id={messageId} className={cx(styles.message, invalid && styles.messageInvalid)}>
          {message}
        </p>
      )}
    </div>
  );
}
