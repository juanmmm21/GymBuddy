import {
  formatGramsAsKilograms,
  parseKilogramsToGrams,
  type Locale,
  type PersonalRecord,
  type ResourceId,
  type SetEntry,
} from '@gymbuddy/shared';
import { useState, type FormEvent } from 'react';
import { freshRecords, useRemoveSet, useUpdateSet } from '../../api/mutations';
import { Button, Notice, Sheet } from '../../components/index';
import { describeError } from '../../lib/errors';
import styles from './EditSetSheet.module.css';
import { isCompleteSet, SetFields, type SetValues } from './SetFields';

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
  const [values, setValues] = useState<SetValues>(() => valuesOf(set));
  const update = useUpdateSet();
  const remove = useRemoveSet();

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!isCompleteSet(values)) return;

    update.mutate(
      {
        sessionId,
        setId: set.id,
        body: {
          weight: formatGramsAsKilograms(values.weightGrams),
          reps: values.reps,
          rpe: values.rpe,
          isWarmup: values.isWarmup,
        },
      },
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
      <SetFields
        values={values}
        onChange={setValues}
        locale={locale}
        weightHint="Lo que registraste. Cámbialo y se recalculan tus marcas."
      />

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
        disabled={!isCompleteSet(values) || busy}
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

/** La serie guardada, tal y como la edita el formulario: el peso vuelve a gramos enteros. */
function valuesOf(set: SetEntry): SetValues {
  return {
    weightGrams: parseKilogramsToGrams(set.weight),
    reps: set.reps,
    rpe: set.rpe,
    isWarmup: set.isWarmup,
  };
}
