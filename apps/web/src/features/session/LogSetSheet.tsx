import {
  formatGramsAsKilograms,
  parseKilogramsToGrams,
  type Locale,
  type LogSetResponse,
  type ResourceId,
  type TrackedExercise,
} from '@gymbuddy/shared';
import { useState, type FormEvent } from 'react';
import { useLogSet } from '../../api/mutations';
import {
  Button,
  Notice,
  NumberField,
  Select,
  Sheet,
  WeightField,
  type SelectOption,
} from '../../components/index';
import { cx } from '../../lib/cx';
import { describeError } from '../../lib/errors';
import { formatRpe } from '../../lib/format';
import { newResourceId } from '../../lib/ids';
import { groupExercisesByBodyPart } from '../exercises/grouping';
import styles from './LogSetSheet.module.css';

/** Los valores de RPE que se anotan de verdad: por debajo de 6 la serie no dice nada. */
const RPE_OPTIONS: readonly number[] = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
const NO_RPE = '';

/** El tope de repeticiones del contrato (`logSetRequestSchema`). */
const MAX_REPS = 1000;

export interface LogSetSheetProps {
  readonly sessionId: ResourceId;
  /** Entre los que se elige: los que el usuario sigue y no ha archivado. */
  readonly exercises: readonly TrackedExercise[];
  /** El que trae la URL al llegar desde su ficha; si no está, se abre con el primero. */
  readonly defaultExerciseId: ResourceId | null;
  readonly locale: Locale;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onLogged: (response: LogSetResponse) => void;
}

/**
 * Registrar una serie. El formulario vive dentro de la hoja, que solo monta su contenido
 * mientras está abierta: cada apertura arranca precargada con el peso habitual del
 * ejercicio elegido, sin restos de la anterior y sin efectos que lo resincronicen.
 */
export function LogSetSheet({
  sessionId,
  exercises,
  defaultExerciseId,
  locale,
  open,
  onClose,
  onLogged,
}: LogSetSheetProps) {
  const initial = exercises.find((exercise) => exercise.id === defaultExerciseId) ?? exercises[0];

  return (
    <Sheet open={open} onClose={onClose} title="Registrar serie">
      {initial === undefined ? (
        <Notice title="Todavía no sigues ningún ejercicio">
          Sigue uno desde el catálogo y podrás registrar tus series aquí.
        </Notice>
      ) : (
        <LogSetForm
          sessionId={sessionId}
          exercises={exercises}
          initialExercise={initial}
          locale={locale}
          onLogged={onLogged}
        />
      )}
    </Sheet>
  );
}

interface LogSetFormProps {
  readonly sessionId: ResourceId;
  readonly exercises: readonly TrackedExercise[];
  readonly initialExercise: TrackedExercise;
  readonly locale: Locale;
  readonly onLogged: (response: LogSetResponse) => void;
}

function LogSetForm({ sessionId, exercises, initialExercise, locale, onLogged }: LogSetFormProps) {
  const [exercise, setExercise] = useState(initialExercise);
  const [weightGrams, setWeightGrams] = useState(workingWeightGramsOf(initialExercise));
  const [reps, setReps] = useState<number | null>(initialExercise.workingWeight?.reps ?? null);
  const [rpe, setRpe] = useState<number | null>(null);
  const [isWarmup, setIsWarmup] = useState(false);
  const log = useLogSet();

  // Cambiar de ejercicio recarga lo que se propone: cada uno tiene su peso habitual, y
  // dejar el del anterior es la forma más fácil de registrar una serie equivocada.
  const selectExercise = (value: string): void => {
    const next = exercises.find((candidate) => candidate.id === value);
    if (next === undefined) return;

    setExercise(next);
    setWeightGrams(workingWeightGramsOf(next));
    setReps(next.workingWeight?.reps ?? null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (weightGrams === null || reps === null) return;

    log.mutate(
      {
        sessionId,
        body: {
          id: newResourceId(),
          trackedExerciseId: exercise.id,
          weight: formatGramsAsKilograms(weightGrams),
          reps,
          rpe,
          isWarmup,
          source: 'web',
        },
      },
      { onSuccess: onLogged },
    );
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <Select
        label="Ejercicio"
        value={exercise.id}
        onChange={selectExercise}
        options={exerciseOptions(exercises)}
      />

      <WeightField
        label="Peso"
        valueGrams={weightGrams}
        onChange={setWeightGrams}
        hint={
          exercise.workingWeight === null
            ? 'Es tu primera serie de este ejercicio: todavía no hay peso habitual.'
            : 'Tu peso habitual, con las repeticiones de la última vez.'
        }
      />

      <NumberField label="Repeticiones" value={reps} onChange={setReps} min={1} max={MAX_REPS} />

      <div className={styles.row}>
        <Select
          label="RPE"
          value={rpe === null ? NO_RPE : String(rpe)}
          onChange={(value) => {
            setRpe(RPE_OPTIONS.find((option) => String(option) === value) ?? null);
          }}
          options={rpeOptions(locale)}
        />

        <button
          type="button"
          className={cx(styles.warmup, isWarmup && styles.warmupActive)}
          aria-pressed={isWarmup}
          onClick={() => {
            setIsWarmup(!isWarmup);
          }}
        >
          Calentamiento
        </button>
      </div>

      {log.isError && (
        <Notice tone="danger" title="No se pudo registrar">
          {describeError(log.error)}
        </Notice>
      )}

      <Button
        type="submit"
        size="lg"
        fullWidth
        loading={log.isPending}
        disabled={weightGrams === null || reps === null}
      >
        Registrar serie
      </Button>
    </form>
  );
}

/** El peso habitual en gramos enteros: del contrato al campo sin pasar por `Number`. */
function workingWeightGramsOf(exercise: TrackedExercise): number | null {
  return exercise.workingWeight === null
    ? null
    : parseKilogramsToGrams(exercise.workingWeight.weight);
}

/** Las mismas agrupaciones que "mis ejercicios": se busca donde uno está acostumbrado. */
function exerciseOptions(exercises: readonly TrackedExercise[]): SelectOption[] {
  return groupExercisesByBodyPart(exercises).flatMap((group) =>
    group.items.map((exercise) => ({
      value: exercise.id,
      label: exercise.name,
      group: group.label,
    })),
  );
}

function rpeOptions(locale: Locale): SelectOption[] {
  return [
    { value: NO_RPE, label: 'Sin anotar' },
    ...RPE_OPTIONS.map((option) => ({ value: String(option), label: formatRpe(option, locale) })),
  ];
}
