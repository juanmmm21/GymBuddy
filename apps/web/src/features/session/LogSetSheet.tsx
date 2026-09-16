import {
  formatGramsAsKilograms,
  type Locale,
  type PersonalRecord,
  type LogSetRequest,
  type ResourceId,
  type SetEntry,
  type TrackedExercise,
} from '@gymbuddy/shared';
import { useState, type FormEvent } from 'react';
import { freshRecords, useLogSet } from '../../api/mutations';
import { Button, Notice, Sheet } from '../../components/index';
import { describeError } from '../../lib/errors';
import { newResourceId } from '../../lib/ids';
import { describeNextSet, lineForNextSet, type RoutineProgress } from './routine-progress';
import {
  describeCardioProposal,
  describeProposal,
  proposeCardioSet,
  proposeSet,
  setKindFor,
  type CardioSetProposal,
} from './set-proposal';
import { cardioDurationSoFar } from './cardio-in-progress';
import { ExerciseChoice } from './ExerciseChoice';
import { ExercisePicker } from './ExercisePicker';
import styles from './LogSetSheet.module.css';
import {
  CardioSetFields,
  isCompleteCardioSet,
  isCompleteSet,
  SetFields,
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
  /** El reparto de la rutina que guía la sesión, para decir bajo las repeticiones qué toca. */
  readonly routineProgress: RoutineProgress | null;
  /** Las series de la sesión con la cola encima: la última de cada ejercicio es lo que se propone. */
  readonly sessionSets: readonly SetEntry[];
  /** El cardio en marcha: si lo hay, un cardio se abre con el tiempo que lleva y no con el de la última vez. */
  readonly cardioStartedAt: string | null;
  readonly locale: Locale;
  readonly open: boolean;
  readonly onClose: () => void;
  /** Registrada o guardada para enviar: con las marcas que batió, si ya lo sabe el Worker. */
  readonly onLogged: (records: readonly PersonalRecord[]) => void;
}

/**
 * Registrar una serie, de fuerza o de cardio según el ejercicio (`setKindFor`). El formulario vive dentro de la hoja, que solo monta
 * su contenido mientras está abierta: cada apertura arranca precargada con la última serie del
 * ejercicio elegido, sin restos de la anterior y sin efectos que lo resincronicen.
 */
export function LogSetSheet({
  sessionId,
  exercises,
  defaultExerciseId,
  routineProgress,
  sessionSets,
  cardioStartedAt,
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
          cardioStartedAt={cardioStartedAt}
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
  readonly cardioStartedAt: string | null;
  readonly locale: Locale;
  readonly onLogged: (records: readonly PersonalRecord[]) => void;
}

function LogSetForm({
  sessionId,
  exercises,
  initialExercise,
  routineProgress,
  sessionSets,
  cardioStartedAt,
  locale,
  onLogged,
}: LogSetFormProps) {
  // Lo que se propone en cardio: con un cardio en marcha, el tiempo que lleva; si no, lo de la última vez.
  const proposeCardio = (target: TrackedExercise): CardioSetProposal => {
    const proposal = proposeCardioSet(target, sessionSets);
    if (cardioStartedAt === null) return proposal;
    return {
      ...proposal,
      values: {
        ...proposal.values,
        durationSeconds: cardioDurationSoFar(cardioStartedAt, Date.now()),
      },
    };
  };

  const [exercise, setExercise] = useState(initialExercise);
  const [proposal, setProposal] = useState(() => proposeSet(initialExercise, sessionSets));
  const [values, setValues] = useState<SetValues>(proposal.values);
  const [cardioProposal, setCardioProposal] = useState(() => proposeCardio(initialExercise));
  const [cardioValues, setCardioValues] = useState<CardioSetValues>(cardioProposal.values);
  // Fijado al abrir la hoja y no al pulsar: reintentar tras un fallo es la misma serie, y la
  // cola offline no puede convertir un doble toque sin red en dos series.
  const [setId] = useState(newResourceId);
  const [picking, setPicking] = useState(false);
  const log = useLogSet();
  // Sale del ejercicio elegido: cambiarlo en el selector cambia también el objetivo que se lee.
  const kind = setKindFor(exercise);
  const routineLine =
    routineProgress === null ? null : lineForNextSet(routineProgress, exercise.id);
  const complete = kind === 'strength' ? isCompleteSet(values) : isCompleteCardioSet(cardioValues);

  // Cambiar de ejercicio recarga lo que se propone —y con él el tipo—: cada uno tiene su última serie, y
  // dejar la del anterior es la forma más fácil de registrar una serie equivocada.
  const selectExercise = (value: string): void => {
    const next = exercises.find((candidate) => candidate.id === value);
    if (next === undefined) return;

    const nextProposal = proposeSet(next, sessionSets);
    const nextCardioProposal = proposeCardio(next);
    setExercise(next);
    setProposal(nextProposal);
    setValues(nextProposal.values);
    setCardioProposal(nextCardioProposal);
    setCardioValues(nextCardioProposal.values);
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
    <>
      {picking && (
        <ExercisePicker
          exercises={exercises}
          selected={exercise}
          routineProgress={routineProgress}
          sessionSets={sessionSets}
          locale={locale}
          onPick={(exerciseId) => {
            // Volver a tocar el elegido no recarga nada: lo tecleado se queda.
            if (exerciseId !== exercise.id) selectExercise(exerciseId);
            setPicking(false);
          }}
          onBack={() => {
            setPicking(false);
          }}
        />
      )}
      {/* Oculto y no desmontado mientras se elige: volver sin cambiar conserva lo tecleado. */}
      <form className={styles.form} onSubmit={handleSubmit} hidden={picking}>
        <ExerciseChoice
          exercise={exercise}
          onChange={() => {
            setPicking(true);
          }}
        />

        {kind === 'strength' ? (
          <SetFields
            values={values}
            onChange={setValues}
            locale={locale}
            unilateral={exercise.unilateral}
            weightHint={describeProposal(proposal.source)}
            repsHint={routineLine === null ? undefined : describeNextSet(routineLine)}
          />
        ) : (
          <CardioSetFields
            values={cardioValues}
            onChange={setCardioValues}
            locale={locale}
            durationHint={
              cardioStartedAt === null
                ? describeCardioProposal(cardioProposal.source)
                : 'El tiempo desde que empezaste el cardio. Cámbialo si paraste antes.'
            }
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
    </>
  );
}
