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
import { Button, Notice, Select, Sheet } from '../../components/index';
import { describeError } from '../../lib/errors';
import { newResourceId } from '../../lib/ids';
import { exerciseSelectOptions } from '../exercises/grouping';
import { describeNextSet, lineForNextSet, type RoutineProgress } from './routine-progress';
import styles from './LogSetSheet.module.css';
import { isCompleteSet, SetFields, type SetValues } from './SetFields';

export interface LogSetSheetProps {
  readonly sessionId: ResourceId;
  /**
   * Entre los que se elige: los que el usuario sigue y no ha archivado, más los archivados
   * que nombre la rutina que guía la sesión (el Worker acepta series de un archivado).
   */
  readonly exercises: readonly TrackedExercise[];
  /** El de la ficha de la que se llega o el de la línea de la rutina; si no, el primero. */
  readonly defaultExerciseId: ResourceId | null;
  /** El reparto de la rutina que guía la sesión, para decir bajo las repeticiones qué toca. */
  readonly routineProgress: RoutineProgress | null;
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
  routineProgress,
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
          routineProgress={routineProgress}
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
  readonly routineProgress: RoutineProgress | null;
  readonly locale: Locale;
  readonly onLogged: (response: LogSetResponse) => void;
}

function LogSetForm({
  sessionId,
  exercises,
  initialExercise,
  routineProgress,
  locale,
  onLogged,
}: LogSetFormProps) {
  const [exercise, setExercise] = useState(initialExercise);
  const [values, setValues] = useState<SetValues>(() => proposalFor(initialExercise));
  const log = useLogSet();
  // Sale del ejercicio elegido: cambiarlo en el selector cambia también el objetivo que se lee.
  const routineLine =
    routineProgress === null ? null : lineForNextSet(routineProgress, exercise.id);

  // Cambiar de ejercicio recarga lo que se propone: cada uno tiene su peso habitual, y
  // dejar el del anterior es la forma más fácil de registrar una serie equivocada.
  const selectExercise = (value: string): void => {
    const next = exercises.find((candidate) => candidate.id === value);
    if (next === undefined) return;

    setExercise(next);
    setValues(proposalFor(next));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!isCompleteSet(values)) return;

    log.mutate(
      {
        sessionId,
        body: {
          id: newResourceId(),
          trackedExerciseId: exercise.id,
          weight: formatGramsAsKilograms(values.weightGrams),
          reps: values.reps,
          rpe: values.rpe,
          isWarmup: values.isWarmup,
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
        options={exerciseSelectOptions(exercises)}
      />

      <SetFields
        values={values}
        onChange={setValues}
        locale={locale}
        weightHint={
          exercise.workingWeight === null
            ? 'Es tu primera serie de este ejercicio: todavía no hay peso habitual.'
            : 'Tu peso habitual, con las repeticiones de la última vez.'
        }
        repsHint={routineLine === null ? undefined : describeNextSet(routineLine)}
      />

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
        disabled={!isCompleteSet(values)}
      >
        Registrar serie
      </Button>
    </form>
  );
}

/** Lo que se propone al elegir un ejercicio: su peso habitual y las repeticiones de la última vez. */
function proposalFor(exercise: TrackedExercise): SetValues {
  return {
    // Del contrato al campo sin pasar por `Number`: el peso es entero de gramos.
    weightGrams:
      exercise.workingWeight === null ? null : parseKilogramsToGrams(exercise.workingWeight.weight),
    reps: exercise.workingWeight?.reps ?? null,
    rpe: null,
    isWarmup: false,
  };
}
