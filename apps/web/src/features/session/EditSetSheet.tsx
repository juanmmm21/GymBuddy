import {
  formatGramsAsKilograms,
  parseKilogramsToGrams,
  type Locale,
  type PersonalRecord,
  type ResourceId,
  type SetEntry,
  type UpdateSetRequest,
} from '@gymbuddy/shared';
import { useState, type FormEvent } from 'react';
import { freshRecords, useRemoveSet, useUpdateSet } from '../../api/mutations';
import { Button, Notice, Sheet } from '../../components/index';
import { describeError } from '../../lib/errors';
import styles from './EditSetSheet.module.css';
import {
  CardioSetFields,
  isCompleteCardioSet,
  isCompleteSet,
  SetFields,
  type CardioSetValues,
  type SetValues,
} from './SetFields';

export interface EditSetSheetProps {
  readonly sessionId: ResourceId;
  /** La serie que se corrige, o `null` cuando no hay ninguna abierta. */
  readonly set: SetEntry | null;
  readonly exerciseName: string;
  readonly locale: Locale;
  readonly onClose: () => void;
  readonly onUpdated: (records: readonly PersonalRecord[]) => void;
  readonly onRemoved: () => void;
}

/**
 * Corregir o borrar una serie ya registrada. Se teclea entre series y con prisa, así que
 * el peso equivocado es cuestión de tiempo; sin esto, la única salida sería dejar la
 * sesión con un dato falso que además arrastraría una marca que nunca se levantó.
 */
export function EditSetSheet({
  sessionId,
  set,
  exerciseName,
  locale,
  onClose,
  onUpdated,
  onRemoved,
}: EditSetSheetProps) {
  return (
    <Sheet open={set !== null} onClose={onClose} title={`Corregir serie · ${exerciseName}`}>
      {set !== null && (
        <EditSetForm
          sessionId={sessionId}
          set={set}
          locale={locale}
          onUpdated={onUpdated}
          onRemoved={onRemoved}
        />
      )}
    </Sheet>
  );
}

interface EditSetFormProps {
  readonly sessionId: ResourceId;
  readonly set: SetEntry;
  readonly locale: Locale;
  readonly onUpdated: (records: readonly PersonalRecord[]) => void;
  readonly onRemoved: () => void;
}

function EditSetForm({ sessionId, set, locale, onUpdated, onRemoved }: EditSetFormProps) {
  const [values, setValues] = useState<SetValues>(() => strengthValuesOf(set));
  const [cardioValues, setCardioValues] = useState<CardioSetValues>(() => cardioValuesOf(set));
  const update = useUpdateSet();
  const remove = useRemoveSet();
  // El tipo no se corrige (ver `updateSetRequestSchema`): cambiarlo es borrar la serie y registrar otra.
  const complete =
    set.kind === 'strength' ? isCompleteSet(values) : isCompleteCardioSet(cardioValues);

  const requestBody = (): UpdateSetRequest | null => {
    if (set.kind === 'strength') {
      if (!isCompleteSet(values)) return null;
      return {
        weight: formatGramsAsKilograms(values.weightGrams),
        reps: values.reps,
        rpe: values.rpe,
        isWarmup: values.isWarmup,
      };
    }

    if (!isCompleteCardioSet(cardioValues)) return null;
    return {
      durationSeconds: cardioValues.durationSeconds,
      // Nula y no ausente: vaciar el campo tiene que quitar la distancia anotada por error.
      distanceMeters: cardioValues.distanceMeters,
      rpe: cardioValues.rpe,
      isWarmup: cardioValues.isWarmup,
    };
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const body = requestBody();
    if (body === null) return;

    update.mutate(
      { sessionId, setId: set.id, body },
      {
        onSuccess: (outcome) => {
          onUpdated(freshRecords(outcome));
        },
      },
    );
  };

  const handleRemove = (): void => {
    remove.mutate({ sessionId, setId: set.id }, { onSuccess: onRemoved });
  };

  const busy = update.isPending || remove.isPending;

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {set.kind === 'strength' ? (
        <SetFields
          values={values}
          onChange={setValues}
          locale={locale}
          weightHint="Lo que registraste. Cámbialo y se recalculan tus marcas."
        />
      ) : (
        <CardioSetFields
          values={cardioValues}
          onChange={setCardioValues}
          locale={locale}
          durationHint="Lo que registraste. En minutos, o minutos y segundos: 25:30."
        />
      )}

      {update.isError && (
        <Notice tone="danger" title="No se pudo corregir">
          {describeError(update.error)}
        </Notice>
      )}

      {remove.isError && (
        <Notice tone="danger" title="No se pudo borrar">
          {describeError(remove.error)}
        </Notice>
      )}

      <Button
        type="submit"
        size="lg"
        fullWidth
        loading={update.isPending}
        disabled={!complete || busy}
      >
        Guardar cambios
      </Button>

      <div className={styles.remove}>
        <Button
          variant="danger"
          fullWidth
          loading={remove.isPending}
          disabled={busy}
          onClick={handleRemove}
        >
          Borrar serie
        </Button>
        <p className={styles.removeHint}>
          Desaparece de la sesión y de tu historial, con las marcas que hubiera puesto.
        </p>
      </div>
    </form>
  );
}

/**
 * La serie guardada, tal y como la edita el formulario: el peso vuelve a gramos enteros. Los dos
 * estados se crean siempre, vacío el del otro tipo, para no condicionar los `useState`.
 */
function strengthValuesOf(set: SetEntry): SetValues {
  if (set.kind !== 'strength') {
    return { weightGrams: null, reps: null, rpe: set.rpe, isWarmup: set.isWarmup };
  }

  return {
    weightGrams: parseKilogramsToGrams(set.weight),
    reps: set.reps,
    rpe: set.rpe,
    isWarmup: set.isWarmup,
  };
}

function cardioValuesOf(set: SetEntry): CardioSetValues {
  if (set.kind !== 'cardio') {
    return { durationSeconds: null, distanceMeters: null, rpe: set.rpe, isWarmup: set.isWarmup };
  }

  return {
    durationSeconds: set.durationSeconds,
    distanceMeters: set.distanceMeters,
    rpe: set.rpe,
    isWarmup: set.isWarmup,
  };
}
