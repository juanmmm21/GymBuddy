import type { Locale } from '@gymbuddy/shared';
import { NumberField, Select, WeightField, type SelectOption } from '../../components/index';
import { cx } from '../../lib/cx';
import { formatRpe } from '../../lib/format';
import styles from './SetFields.module.css';

/** Los valores de RPE que se anotan de verdad: por debajo de 6 la serie no dice nada. */
const RPE_OPTIONS: readonly number[] = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
const NO_RPE = '';

/** El tope de repeticiones del contrato (`logSetRequestSchema` y `updateSetRequestSchema`). */
export const MAX_REPS = 1000;

/** Lo que describe una serie en un formulario. El peso va en gramos enteros, como siempre. */
export interface SetValues {
  readonly weightGrams: number | null;
  readonly reps: number | null;
  readonly rpe: number | null;
  readonly isWarmup: boolean;
}

/** Una serie está lista para enviarse cuando tiene peso y repeticiones. */
export function isCompleteSet(
  values: SetValues,
): values is SetValues & { weightGrams: number; reps: number } {
  return values.weightGrams !== null && values.reps !== null;
}

export interface SetFieldsProps {
  readonly values: SetValues;
  readonly onChange: (values: SetValues) => void;
  readonly locale: Locale;
  /** Lo que se explica bajo el peso: de dónde sale el que viene puesto. */
  readonly weightHint: string;
}

/**
 * Los cuatro campos que describen una serie. Los comparten registrarla y corregirla: son
 * el mismo dato, y tener dos formularios parecidos acabaría con uno de los dos aceptando
 * algo que el otro no.
 */
export function SetFields({ values, onChange, locale, weightHint }: SetFieldsProps) {
  return (
    <>
      <WeightField
        label="Peso"
        valueGrams={values.weightGrams}
        onChange={(weightGrams) => {
          onChange({ ...values, weightGrams });
        }}
        hint={weightHint}
      />

      <NumberField
        label="Repeticiones"
        value={values.reps}
        onChange={(reps) => {
          onChange({ ...values, reps });
        }}
        min={1}
        max={MAX_REPS}
      />

      <div className={styles.row}>
        <Select
          label="RPE"
          value={values.rpe === null ? NO_RPE : String(values.rpe)}
          onChange={(value) => {
            onChange({
              ...values,
              rpe: RPE_OPTIONS.find((option) => String(option) === value) ?? null,
            });
          }}
          options={rpeOptions(locale)}
        />

        <button
          type="button"
          className={cx(styles.warmup, values.isWarmup && styles.warmupActive)}
          aria-pressed={values.isWarmup}
          onClick={() => {
            onChange({ ...values, isWarmup: !values.isWarmup });
          }}
        >
          Calentamiento
        </button>
      </div>
    </>
  );
}

function rpeOptions(locale: Locale): SelectOption[] {
  return [
    { value: NO_RPE, label: 'Sin anotar' },
    ...RPE_OPTIONS.map((option) => ({ value: String(option), label: formatRpe(option, locale) })),
  ];
}
