import { WEIGHT_UNITS, type Locale, type WeightUnit } from '@gymbuddy/shared';
import { useId, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { cx } from '../../lib/cx';
import { formatWeightInUnit } from '../../lib/format';
import styles from './WeightField.module.css';
import {
  DEFAULT_WEIGHT_STEPS,
  formatWeightForInput,
  formatWeightStep,
  parseWeightInput,
  stepWeight,
  WEIGHT_STEPS,
} from './weight-math';
import { t } from '../../i18n/index';

export interface WeightFieldProps {
  readonly label: string;
  /** Peso en gramos enteros, o `null` si el campo está vacío. */
  readonly valueGrams: number | null;
  readonly onChange: (grams: number | null) => void;
  /** Para la coma de la equivalencia que se lee bajo el campo. */
  readonly locale: Locale;
  /** En qué se teclea. Si no se controla desde fuera, el campo lo gestiona solo y empieza en kilos. */
  readonly unit?: WeightUnit;
  readonly onUnitChange?: (unit: WeightUnit) => void;
  readonly disabled?: boolean;
  readonly hint?: string;
}

function invalidMessage(unit: WeightUnit): string {
  return unit === 'kg'
    ? t('Escribe un peso en kilogramos, por ejemplo 82,5', 'Enter a weight in kilograms, e.g. 82.5')
    : t(
        'Escribe un peso en libras, por ejemplo 100 o 112,5',
        'Enter a weight in pounds, e.g. 100 or 112.5',
      );
}

/**
 * Campo numérico de peso. El valor vive en gramos enteros; lo que se teclea se convierte
 * al confirmar (al salir del campo o con Intro), nunca en cada pulsación, para que
 * escribir "8" de camino a "82,5" no dispare tres cambios de peso.
 *
 * Se teclea en kilos o, a demanda, en libras (hay máquinas rotuladas así). Juan quiere leerlo todo
 * en kilos: en libras, debajo sale el peso en kilos, y en kilos no se enseña ninguna libra. La unidad
 * es solo una forma de escribirlo; lo que sale del campo sigue siendo gramos.
 */
export function WeightField({
  label,
  valueGrams,
  onChange,
  locale,
  unit,
  onUnitChange,
  disabled = false,
  hint,
}: WeightFieldProps) {
  const inputId = useId();
  const messageId = useId();
  // `null` significa "no se está editando": lo que se ve sale del valor de fuera.
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [internalUnit, setInternalUnit] = useState<WeightUnit>('kg');
  // Un salto elegido por unidad: volver a libras recupera el de libras, no el de kilos convertido.
  const [steps, setSteps] = useState(DEFAULT_WEIGHT_STEPS);

  const activeUnit = unit ?? internalUnit;
  const activeStep = steps[activeUnit];
  const unitStepLabel = `${formatWeightStep(activeStep, activeUnit)} ${activeUnit}`;
  const shownValue = draft ?? formatWeightForInput(valueGrams, activeUnit);

  const selectUnit = (next: WeightUnit): void => {
    // Pulsar la unidad saca el foco del campo, y ese `blur` ya confirmó lo tecleado en la anterior.
    setInternalUnit(next);
    setDraft(null);
    setInvalid(false);
    onUnitChange?.(next);
  };

  const commit = (): void => {
    const parsed = parseWeightInput(draft ?? shownValue, activeUnit);
    if (parsed.kind === 'invalid') {
      setInvalid(true);
      return;
    }
    onChange(parsed.kind === 'empty' ? null : parsed.grams);
    setDraft(null);
    setInvalid(false);
  };

  const nudge = (direction: 1 | -1): void => {
    onChange(stepWeight(valueGrams, direction * activeStep, activeUnit));
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

  const message = invalid ? invalidMessage(activeUnit) : hint;

  return (
    <div className={styles.field}>
      <div className={styles.header}>
        <label className={styles.label} htmlFor={inputId}>
          {label}
        </label>

        <div className={styles.units} role="group" aria-label={t('Unidad de peso', 'Weight unit')}>
          {WEIGHT_UNITS.map((candidate) => (
            <button
              key={candidate}
              type="button"
              className={cx(styles.unitOption, candidate === activeUnit && styles.unitOptionActive)}
              aria-pressed={candidate === activeUnit}
              disabled={disabled}
              onClick={() => {
                selectUnit(candidate);
              }}
            >
              {candidate}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.stepper}
          onClick={() => {
            nudge(-1);
          }}
          disabled={disabled || (valueGrams ?? 0) === 0}
          aria-label={t(`Restar ${unitStepLabel}`, `Subtract ${unitStepLabel}`)}
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
            {activeUnit}
          </span>
        </div>

        <button
          type="button"
          className={styles.stepper}
          onClick={() => {
            nudge(1);
          }}
          disabled={disabled}
          aria-label={t(`Sumar ${unitStepLabel}`, `Add ${unitStepLabel}`)}
        >
          +
        </button>
      </div>

      {valueGrams !== null && activeUnit === 'lb' && (
        <p className={styles.equivalent}>≈ {formatWeightInUnit(valueGrams, 'kg', locale)}</p>
      )}

      <div className={styles.steps} role="group" aria-label={t('Salto de peso', 'Weight step')}>
        {WEIGHT_STEPS[activeUnit].map((candidate) => (
          <button
            key={candidate}
            type="button"
            className={cx(styles.stepChip, candidate === activeStep && styles.stepChipActive)}
            aria-pressed={candidate === activeStep}
            disabled={disabled}
            onClick={() => {
              setSteps((current) => ({ ...current, [activeUnit]: candidate }));
            }}
          >
            {formatWeightStep(candidate, activeUnit)}
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
