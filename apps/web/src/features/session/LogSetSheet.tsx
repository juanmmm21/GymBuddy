import {
  formatGramsAsKilograms,
  type Locale,
  type PersonalRecord,
  type LogSetRequest,
  type ResourceId,
  type SetEntry,
  type SetKind,
  type TrackedExercise,
} from '@gymbuddy/shared';
import { useState, type FormEvent } from 'react';
import { freshRecords, useLogSet } from '../../api/mutations';
import { Button, Notice, Select, Sheet } from '../../components/index';
import { describeError } from '../../lib/errors';
import { newResourceId } from '../../lib/ids';
import { exerciseSelectOptions } from '../exercises/grouping';
import { describeNextSet, lineForNextSet, type RoutineProgress } from './routine-progress';
import {
  defaultSetKind,
  describeCardioProposal,
  describeProposal,
  proposeCardioSet,
  proposeSet,
} from './set-proposal';
import styles from './LogSetSheet.module.css';
import {
  CardioSetFields,
  isCompleteCardioSet,
  isCompleteSet,
  SetFields,
  SetKindSwitch,
  type CardioSetValues,
  type SetValues,
} from './SetFields';

export interface LogSetSheetProps {
  readonly sessionId: ResourceId;
  /**
   * Entre los que se elige: los que el usuario sigue y no ha archivado, más los archivados
   * que nombre la rutina que guía la sesión (el Worker acepta series de un archivado).
   */
  readonly exercises: readonly TrackedExercise[];
  /**
   * El que decide `logExerciseIdFor` (la línea de la rutina, la última serie de la sesión o la
   * ficha de la que se llega); si es nulo o ya no se puede elegir, el primero.
   */
  readonly defaultExerciseId: ResourceId | null;
  /**
   * Con qué tipo abre; `null` lo decide `defaultSetKind` con el ejercicio. El cardio final lo fija:
   * se pide cardio aunque el ejercicio propuesto tenga una serie de fuerza más reciente.
   */
  readonly defaultKind: SetKind | null;
  /** El reparto de la rutina que guía la sesión, para decir bajo las repeticiones qué toca. */
  readonly routineProgress: RoutineProgress | null;
  /** Las series de la sesión con la cola encima: la última de cada ejercicio es lo que se propone. */
  readonly sessionSets: readonly SetEntry[];
  readonly locale: Locale;
  readonly open: boolean;
  readonly onClose: () => void;
  /** Registrada o guardada para enviar: con las marcas que batió, si ya lo sabe el Worker. */
  readonly onLogged: (records: readonly PersonalRecord[]) => void;
}

/**
 * Registrar una serie, de fuerza o de cardio. El formulario vive dentro de la hoja, que solo monta
 * su contenido mientras está abierta: cada apertura arranca precargada con la última serie del
 * ejercicio elegido, sin restos de la anterior y sin efectos que lo resincronicen.
 */
export function LogSetSheet({
  sessionId,
  exercises,
  defaultExerciseId,
  defaultKind,
  routineProgress,
  sessionSets,
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
          initialKind={defaultKind}
          routineProgress={routineProgress}
          sessionSets={sessionSets}
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
  readonly initialKind: SetKind | null;
  readonly routineProgress: RoutineProgress | null;
  readonly sessionSets: readonly SetEntry[];
  readonly locale: Locale;
  readonly onLogged: (records: readonly PersonalRecord[]) => void;
}

function LogSetForm({
  sessionId,
  exercises,
  initialExercise,
  initialKind,
  routineProgress,
  sessionSets,
  locale,
  onLogged,
}: LogSetFormProps) {
  const [exercise, setExercise] = useState(initialExercise);
  const [kind, setKind] = useState<SetKind>(
    () => initialKind ?? defaultSetKind(initialExercise, sessionSets),
  );
  const [proposal, setProposal] = useState(() => proposeSet(initialExercise, sessionSets));
  const [values, setValues] = useState<SetValues>(proposal.values);
  const [cardioProposal, setCardioProposal] = useState(() =>
    proposeCardioSet(initialExercise, sessionSets),
  );
  const [cardioValues, setCardioValues] = useState<CardioSetValues>(cardioProposal.values);
  // Fijado al abrir la hoja y no al pulsar: reintentar tras un fallo es la misma serie, y la
  // cola offline no puede convertir un doble toque sin red en dos series.
  const [setId] = useState(newResourceId);
  const log = useLogSet();
  // Sale del ejercicio elegido: cambiarlo en el selector cambia también el objetivo que se lee.
  const routineLine =
    routineProgress === null ? null : lineForNextSet(routineProgress, exercise.id);
  const complete = kind === 'strength' ? isCompleteSet(values) : isCompleteCardioSet(cardioValues);

  // Cambiar de ejercicio recarga lo que se propone y el tipo: cada uno tiene su última serie, y
  // dejar la del anterior es la forma más fácil de registrar una serie equivocada.
  const selectExercise = (value: string): void => {
    const next = exercises.find((candidate) => candidate.id === value);
    if (next === undefined) return;

    const nextProposal = proposeSet(next, sessionSets);
    const nextCardioProposal = proposeCardioSet(next, sessionSets);
    setExercise(next);
    setKind(defaultSetKind(next, sessionSets));
    setProposal(nextProposal);
    setValues(nextProposal.values);
    setCardioProposal(nextCardioProposal);
    setCardioValues(nextCardioProposal.values);
  };

  // Al cambiar de tipo se lleva el esfuerzo anotado: el RPE y el calentamiento son de la serie, no de sus cifras.
  const selectKind = (next: SetKind): void => {
    if (next === 'cardio') {
      setCardioValues((current) => ({ ...current, rpe: values.rpe, isWarmup: values.isWarmup }));
    } else {
      setValues((current) => ({
        ...current,
        rpe: cardioValues.rpe,
        isWarmup: cardioValues.isWarmup,
      }));
    }
    setKind(next);
  };

  const requestBody = (): LogSetRequest | null => {
    const base = { id: setId, trackedExerciseId: exercise.id };
    if (kind === 'strength') {
      if (!isCompleteSet(values)) return null;
      return {
        ...base,
        kind: 'strength',
        weight: formatGramsAsKilograms(values.weightGrams),
        reps: values.reps,
        rpe: values.rpe,
        isWarmup: values.isWarmup,
      };
    }

    if (!isCompleteCardioSet(cardioValues)) return null;
    return {
      ...base,
      kind: 'cardio',
      durationSeconds: cardioValues.durationSeconds,
      distanceMeters: cardioValues.distanceMeters,
      rpe: cardioValues.rpe,
      isWarmup: cardioValues.isWarmup,
    };
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const body = requestBody();
    if (body === null) return;

    log.mutate(
      { sessionId, body },
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

      <SetKindSwitch value={kind} onChange={selectKind} />

      {kind === 'strength' ? (
        <SetFields
          values={values}
          onChange={setValues}
          locale={locale}
          weightHint={describeProposal(proposal.source)}
          repsHint={routineLine === null ? undefined : describeNextSet(routineLine)}
        />
      ) : (
        <CardioSetFields
          values={cardioValues}
          onChange={setCardioValues}
          locale={locale}
          durationHint={describeCardioProposal(cardioProposal.source)}
        />
      )}

      {log.isError && (
        <Notice tone="danger" title="No se pudo registrar">
          {describeError(log.error)}
        </Notice>
      )}

      <Button type="submit" size="lg" fullWidth loading={log.isPending} disabled={!complete}>
        Registrar serie
      </Button>
    </form>
  );
}
