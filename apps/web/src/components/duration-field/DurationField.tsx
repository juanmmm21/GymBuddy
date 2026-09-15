import { useId, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { cx } from '../../lib/cx';
import styles from '../number-field/NumberField.module.css';
import {
  DURATION_STEP_SECONDS,
  formatDurationForInput,
  parseDurationInput,
  stepDuration,
} from './duration-math';

export interface DurationFieldProps {
  readonly label: string;
  /** Duración en segundos enteros, o `null` si el campo está vacío. */
  readonly valueSeconds: number | null;
  readonly onChange: (seconds: number | null) => void;
  readonly disabled?: boolean;
  readonly hint?: string;
}

const INVALID_MESSAGE = 'Escribe los minutos, por ejemplo 30, o minutos y segundos: 25:30';

/**
 * La duración de un cardio, con botones de un minuto. Se teclea en minutos y, si hace falta, con
 * segundos detrás de dos puntos; como en `NumberField`, se confirma al salir del campo o con Intro
 * para que escribir «3» de camino a «30» no valga como tres minutos.
 */
export function DurationField({
  label,
  valueSeconds,
  onChange,
  disabled = false,
  hint,
}: DurationFieldProps) {
  const inputId = useId();
  const messageId = useId();
  // `null` significa "no se está editando": lo que se ve sale del valor de fuera.
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  const shownValue = draft ?? (valueSeconds === null ? '' : formatDurationForInput(valueSeconds));

  const commit = (): void => {
    const parsed = parseDurationInput(draft ?? shownValue);
    if (parsed.kind === 'invalid') {
      setInvalid(true);
      return;
    }
    onChange(parsed.kind === 'empty' ? null : parsed.seconds);
    setDraft(null);
    setInvalid(false);
  };

  const nudge = (direction: 1 | -1): void => {
    onChange(stepDuration(valueSeconds, direction * DURATION_STEP_SECONDS));
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

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.stepper}
          onClick={() => {
            nudge(-1);
          }}
          disabled={disabled || valueSeconds === null || valueSeconds <= DURATION_STEP_SECONDS}
          aria-label="Restar un minuto"
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
          disabled={disabled}
          aria-label="Sumar un minuto"
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
