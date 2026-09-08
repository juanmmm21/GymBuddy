import { useId, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { cx } from '../../lib/cx';
import styles from './WeightField.module.css';
import {
  DEFAULT_WEIGHT_STEP_GRAMS,
  formatWeightForInput,
  parseWeightInput,
  stepWeight,
  WEIGHT_STEPS_GRAMS,
  type WeightStepGrams,
} from './weight-math';

export interface WeightFieldProps {
  readonly label: string;
  /** Peso en gramos enteros, o `null` si el campo está vacío. */
  readonly valueGrams: number | null;
  readonly onChange: (grams: number | null) => void;
  /** Salto de los botones +/−. Si no se controla desde fuera, el campo lo gestiona solo. */
  readonly step?: WeightStepGrams;
  readonly onStepChange?: (step: WeightStepGrams) => void;
  readonly disabled?: boolean;
  readonly hint?: string;
}

const INVALID_MESSAGE = 'Escribe un peso en kilogramos, por ejemplo 82,5';

/**
 * Campo numérico de peso. El valor vive en gramos enteros; lo que se teclea se convierte
 * al confirmar (al salir del campo o con Intro), nunca en cada pulsación, para que
 * escribir "8" de camino a "82,5" no dispare tres cambios de peso.
 */
export function WeightField({
  label,
  valueGrams,
  onChange,
  step,
  onStepChange,
  disabled = false,
  hint,
}: WeightFieldProps) {
  const inputId = useId();
  const messageId = useId();
  // `null` significa "no se está editando": lo que se ve sale del valor de fuera.
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [internalStep, setInternalStep] = useState<WeightStepGrams>(DEFAULT_WEIGHT_STEP_GRAMS);

  const activeStep = step ?? internalStep;
  const shownValue = draft ?? formatWeightForInput(valueGrams);

  const selectStep = (next: WeightStepGrams): void => {
    setInternalStep(next);
    onStepChange?.(next);
  };

  const commit = (): void => {
    const parsed = parseWeightInput(draft ?? shownValue);
    if (parsed.kind === 'invalid') {
      setInvalid(true);
      return;
    }
    onChange(parsed.kind === 'empty' ? null : parsed.grams);
    setDraft(null);
    setInvalid(false);
  };

  const nudge = (direction: 1 | -1): void => {
    onChange(stepWeight(valueGrams, direction * activeStep));
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
          disabled={disabled || (valueGrams ?? 0) === 0}
          aria-label={`Restar ${formatWeightForInput(activeStep)} kg`}
        >
          −
        </button>

        <div className={styles.inputWrap}>
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
          <span className={styles.unit} aria-hidden="true">
            kg
          </span>
        </div>

        <button
          type="button"
          className={styles.stepper}
          onClick={() => {
            nudge(1);
          }}
          disabled={disabled}
          aria-label={`Sumar ${formatWeightForInput(activeStep)} kg`}
        >
          +
        </button>
      </div>

      <div className={styles.steps} role="group" aria-label="Salto de peso">
        {WEIGHT_STEPS_GRAMS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            className={cx(styles.stepChip, candidate === activeStep && styles.stepChipActive)}
            aria-pressed={candidate === activeStep}
            disabled={disabled}
            onClick={() => {
              selectStep(candidate);
            }}
          >
            {formatWeightForInput(candidate)}
          </button>
        ))}
      </div>

      {message !== undefined && (
        <p id={messageId} className={cx(styles.message, invalid && styles.messageInvalid)}>
          {message}
        </p>
      )}
    </div>
  );
}
