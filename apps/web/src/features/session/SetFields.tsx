import type { Locale } from '@gymbuddy/shared';
import {
  DistanceField,
  DurationField,
  NumberField,
  Select,
  WeightField,
  type SelectOption,
} from '../../components/index';
import { cx } from '../../lib/cx';
import { formatRpe, PER_ARM } from '../../lib/format';
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

/** Lo que describe una serie de cardio: segundos y metros enteros, como el peso en gramos. */
export interface CardioSetValues {
  readonly durationSeconds: number | null;
  readonly distanceMeters: number | null;
  readonly rpe: number | null;
  readonly isWarmup: boolean;
}

/** Lo que comparten los dos tipos de serie y se conserva al cambiar de uno a otro. */
type EffortValues = Pick<SetValues, 'rpe' | 'isWarmup'>;

/** Una serie de cardio está lista cuando tiene duración; la distancia es opcional. */
export function isCompleteCardioSet(
  values: CardioSetValues,
): values is CardioSetValues & { durationSeconds: number } {
  return values.durationSeconds !== null;
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
  /** A un brazo: se teclea el peso de un brazo, y la etiqueta lo dice para que no se sumen los dos. */
  readonly unilateral: boolean;
  /** Lo que se explica bajo el peso: de dónde sale el que viene puesto. */
  readonly weightHint: string;
  /** Lo que se explica bajo las repeticiones: el objetivo de la rutina, si la sesión sigue una. */
  readonly repsHint?: string | undefined;
}

/**
 * Los cuatro campos que describen una serie de fuerza. Los comparten registrarla y corregirla: son
 * el mismo dato, y tener dos formularios parecidos acabaría con uno de los dos aceptando
 * algo que el otro no.
 */
export function SetFields({
  values,
  onChange,
  locale,
  unilateral,
  weightHint,
  repsHint,
}: SetFieldsProps) {
  return (
    <>
      <WeightField
        label={unilateral ? `Peso ${PER_ARM}` : 'Peso'}
        valueGrams={values.weightGrams}
        onChange={(weightGrams) => {
          onChange({ ...values, weightGrams });
        }}
        locale={locale}
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
        {...(repsHint === undefined ? {} : { hint: repsHint })}
      />

      <EffortFields values={values} onChange={onChange} locale={locale} />
    </>
  );
}

export interface CardioSetFieldsProps {
  readonly values: CardioSetValues;
  readonly onChange: (values: CardioSetValues) => void;
  readonly locale: Locale;
  /** Lo que se explica bajo la duración: de dónde sale la que viene puesta. */
  readonly durationHint: string;
}

/** Los campos de una serie de cardio: duración, distancia opcional y el mismo esfuerzo que la fuerza. */
export function CardioSetFields({ values, onChange, locale, durationHint }: CardioSetFieldsProps) {
  return (
    <>
      <DurationField
        label="Duración"
        valueSeconds={values.durationSeconds}
        onChange={(durationSeconds) => {
          onChange({ ...values, durationSeconds });
        }}
        hint={durationHint}
      />

      <DistanceField
        label="Distancia (km)"
        valueMeters={values.distanceMeters}
        onChange={(distanceMeters) => {
          onChange({ ...values, distanceMeters });
        }}
        locale={locale}
        hint="Opcional. Déjala vacía si la máquina no la marca."
      />

      <EffortFields values={values} onChange={onChange} locale={locale} />
    </>
  );
}

interface EffortFieldsProps<T extends EffortValues> {
  readonly values: T;
  readonly onChange: (values: T) => void;
  readonly locale: Locale;
}

function EffortFields<T extends EffortValues>({ values, onChange, locale }: EffortFieldsProps<T>) {
  return (
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
  );
}

function rpeOptions(locale: Locale): SelectOption[] {
  return [
    { value: NO_RPE, label: 'Sin anotar' },
    ...RPE_OPTIONS.map((option) => ({ value: String(option), label: formatRpe(option, locale) })),
  ];
}
