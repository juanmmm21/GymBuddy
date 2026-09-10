import {
  MAX_ROUTINE_TARGET_REPS,
  MAX_ROUTINE_TARGET_SETS,
  type ResourceId,
  type RoutineItemInput,
  type TrackedExercise,
} from '@gymbuddy/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useUpdateRoutine } from '../../api/mutations';
import {
  Button,
  Notice,
  NumberField,
  Select,
  Sheet,
  type SelectOption,
} from '../../components/index';
import { describeError } from '../../lib/errors';
import { newResourceId } from '../../lib/ids';
import { CATALOG_PATH } from '../catalog/paths';
import { exerciseSelectOptions } from '../exercises/grouping';
import {
  DEFAULT_TARGET_REPS_MAX,
  DEFAULT_TARGET_REPS_MIN,
  DEFAULT_TARGET_SETS,
  hasInvertedRange,
  removeItem,
  toItemInput,
  upsertItem,
  type ItemValues,
} from './items';
import styles from './RoutineItemSheet.module.css';

export interface RoutineItemSheetProps {
  readonly routineId: ResourceId;
  /** La lista guardada: el cambio se aplica sobre ella y viaja entera en el `PATCH`. */
  readonly items: readonly RoutineItemInput[];
  /** La línea que se edita, o `null` para añadir una nueva al final. */
  readonly item: RoutineItemInput | null;
  /** Todos los ejercicios del usuario, archivados incluidos: una línea puede nombrar uno. */
  readonly exercises: readonly TrackedExercise[];
  readonly open: boolean;
  readonly onClose: () => void;
}

/**
 * Añadir o corregir una línea de la rutina: qué ejercicio, cuántas series y en qué rango
 * de repeticiones. Se guarda al pulsar, igual que el resto de hojas de la app: no hay un
 * borrador de la rutina que se pierda al salir de la pantalla.
 */
export function RoutineItemSheet({
  routineId,
  items,
  item,
  exercises,
  open,
  onClose,
}: RoutineItemSheetProps) {
  // Solo se ofrecen los activos, más el que ya tiene la línea aunque esté archivado:
  // sin él, el selector no podría enseñar lo que la rutina dice.
  const selectable = exercises.filter(
    (exercise) => exercise.archivedAt === null || exercise.id === item?.trackedExerciseId,
  );
  const options = exerciseSelectOptions(selectable);
  const initialExerciseId =
    options.find((option) => option.value === item?.trackedExerciseId)?.value ?? options[0]?.value;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={item === null ? 'Añadir ejercicio' : 'Editar ejercicio'}
    >
      {initialExerciseId === undefined ? (
        <Notice
          title="Todavía no sigues ningún ejercicio"
          action={<Link to={CATALOG_PATH}>Abrir el catálogo</Link>}
        >
          Sigue uno desde el catálogo y podrás añadirlo a tus rutinas.
        </Notice>
      ) : (
        <RoutineItemForm
          routineId={routineId}
          items={items}
          item={item}
          options={options}
          initialExerciseId={initialExerciseId}
          onDone={onClose}
        />
      )}
    </Sheet>
  );
}

interface RoutineItemFormProps {
  readonly routineId: ResourceId;
  readonly items: readonly RoutineItemInput[];
  readonly item: RoutineItemInput | null;
  readonly options: readonly SelectOption[];
  readonly initialExerciseId: ResourceId;
  readonly onDone: () => void;
}

function RoutineItemForm({
  routineId,
  items,
  item,
  options,
  initialExerciseId,
  onDone,
}: RoutineItemFormProps) {
  // Una línea que ya existía conserva su identificador; una nueva lo recibe al abrir la
  // hoja, de modo que reintentar el mismo alta no la duplica.
  const [values, setValues] = useState<ItemValues>(() => ({
    id: item?.id ?? newResourceId(),
    trackedExerciseId: initialExerciseId,
    targetSets: item?.targetSets ?? DEFAULT_TARGET_SETS,
    targetRepsMin: item?.targetRepsMin ?? DEFAULT_TARGET_REPS_MIN,
    targetRepsMax: item?.targetRepsMax ?? DEFAULT_TARGET_REPS_MAX,
  }));
  const update = useUpdateRoutine();
  const ready = toItemInput(values);

  const selectExercise = (value: string): void => {
    if (!options.some((option) => option.value === value)) return;
    setValues({ ...values, trackedExerciseId: value });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (ready === null) return;

    update.mutate({ routineId, body: { items: upsertItem(items, ready) } }, { onSuccess: onDone });
  };

  const handleRemove = (): void => {
    if (item === null) return;

    update.mutate(
      { routineId, body: { items: removeItem(items, item.id) } },
      { onSuccess: onDone },
    );
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <Select
        label="Ejercicio"
        value={values.trackedExerciseId}
        onChange={selectExercise}
        options={options}
      />

      <NumberField
        label="Series"
        value={values.targetSets}
        onChange={(targetSets) => {
          setValues({ ...values, targetSets });
        }}
        min={1}
        max={MAX_ROUTINE_TARGET_SETS}
      />

      <NumberField
        label="Repeticiones mínimas"
        value={values.targetRepsMin}
        onChange={(targetRepsMin) => {
          setValues({ ...values, targetRepsMin });
        }}
        min={1}
        max={MAX_ROUTINE_TARGET_REPS}
      />

      <NumberField
        label="Repeticiones máximas"
        value={values.targetRepsMax}
        onChange={(targetRepsMax) => {
          setValues({ ...values, targetRepsMax });
        }}
        min={1}
        max={MAX_ROUTINE_TARGET_REPS}
        hint={
          hasInvertedRange(values)
            ? 'Tiene que ser igual o mayor que el mínimo.'
            : 'Si siempre haces las mismas, pon el mismo número en las dos.'
        }
      />

      {update.isError && (
        <Notice tone="danger" title="No se pudo guardar">
          {describeError(update.error)}
        </Notice>
      )}

      <Button
        type="submit"
        size="lg"
        fullWidth
        loading={update.isPending}
        disabled={ready === null}
      >
        {item === null ? 'Añadir a la rutina' : 'Guardar'}
      </Button>

      {item !== null && (
        <div className={styles.remove}>
          <Button variant="danger" fullWidth disabled={update.isPending} onClick={handleRemove}>
            Quitar de la rutina
          </Button>
          <p className={styles.removeHint}>
            Solo sale de esta rutina: el ejercicio y su historial siguen en tu lista.
          </p>
        </div>
      )}
    </form>
  );
}
