import {
  formatGramsAsKilograms,
  type Locale,
  type PersonalRecord,
  type ResourceId,
  type SetEntry,
  type TrackedExercise,
  type WeightUnit,
} from '@gymbuddy/shared';
import { useState, type FormEvent } from 'react';
import { freshRecords, useLogSet } from '../../api/mutations';
import { Button, Notice, Select, Sheet } from '../../components/index';
import { describeError } from '../../lib/errors';
import { newResourceId } from '../../lib/ids';
import { exerciseSelectOptions } from '../exercises/grouping';
import { weightUnitFor, type WeightUnitsByExercise } from '../exercises/weight-unit-store';
import { describeNextSet, lineForNextSet, type RoutineProgress } from './routine-progress';
import { describeProposal, proposeSet } from './set-proposal';
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
  /** Las series de la sesión con la cola encima: la última de cada ejercicio es lo que se propone. */
  readonly sessionSets: readonly SetEntry[];
  /** La unidad recordada de cada ejercicio: cambiar de ejercicio cambia también en qué se teclea. */
  readonly weightUnits: WeightUnitsByExercise;
  readonly onWeightUnitChange: (exerciseId: ResourceId, unit: WeightUnit) => void;
  readonly locale: Locale;
  readonly open: boolean;
  readonly onClose: () => void;
  /** Registrada o guardada para enviar: con las marcas que batió, si ya lo sabe el Worker. */
  readonly onLogged: (records: readonly PersonalRecord[]) => void;
}

/**
 * Registrar una serie. El formulario vive dentro de la hoja, que solo monta su contenido
 * mientras está abierta: cada apertura arranca precargada con la última serie del ejercicio
 * elegido, sin restos de la anterior y sin efectos que lo resincronicen.
 */
export function LogSetSheet({
  sessionId,
  exercises,
  defaultExerciseId,
  routineProgress,
  sessionSets,
  weightUnits,
  onWeightUnitChange,
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
          sessionSets={sessionSets}
          weightUnits={weightUnits}
          onWeightUnitChange={onWeightUnitChange}
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
  readonly sessionSets: readonly SetEntry[];
  readonly weightUnits: WeightUnitsByExercise;
  readonly onWeightUnitChange: (exerciseId: ResourceId, unit: WeightUnit) => void;
  readonly locale: Locale;
  readonly onLogged: (records: readonly PersonalRecord[]) => void;
}

function LogSetForm({
  sessionId,
  exercises,
  initialExercise,
  routineProgress,
  sessionSets,
  weightUnits,
  onWeightUnitChange,
  locale,
  onLogged,
}: LogSetFormProps) {
  const [exercise, setExercise] = useState(initialExercise);
  const [proposal, setProposal] = useState(() => proposeSet(initialExercise, sessionSets));
  const [values, setValues] = useState<SetValues>(proposal.values);
  // Fijado al abrir la hoja y no al pulsar: reintentar tras un fallo es la misma serie, y la
  // cola offline no puede convertir un doble toque sin red en dos series.
  const [setId] = useState(newResourceId);
  const log = useLogSet();
  // Sale del ejercicio elegido: cambiarlo en el selector cambia también el objetivo que se lee.
  const routineLine =
    routineProgress === null ? null : lineForNextSet(routineProgress, exercise.id);

  // Cambiar de ejercicio recarga lo que se propone: cada uno tiene su última serie, y
  // dejar la del anterior es la forma más fácil de registrar una serie equivocada.
  const selectExercise = (value: string): void => {
    const next = exercises.find((candidate) => candidate.id === value);
    if (next === undefined) return;

    const nextProposal = proposeSet(next, sessionSets);
    setExercise(next);
    setProposal(nextProposal);
    setValues(nextProposal.values);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!isCompleteSet(values)) return;

    log.mutate(
      {
        sessionId,
        body: {
          id: setId,
          trackedExerciseId: exercise.id,
          weight: formatGramsAsKilograms(values.weightGrams),
          reps: values.reps,
          rpe: values.rpe,
          isWarmup: values.isWarmup,
        },
      },
      {
        onSuccess: (outcome) => {
          onLogged(freshRecords(outcome));
        },
      },
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
        weightHint={describeProposal(proposal.source)}
        repsHint={routineLine === null ? undefined : describeNextSet(routineLine)}
        weightUnit={weightUnitFor(weightUnits, exercise.id)}
        onWeightUnitChange={(unit) => {
          onWeightUnitChange(exercise.id, unit);
        }}
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
