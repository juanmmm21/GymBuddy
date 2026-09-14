import { MAX_ROUTINE_TARGET_SETS, type TrackedExercise } from '@gymbuddy/shared';
import { useState, type FormEvent } from 'react';
import { Button, Notice, NumberField, Select, Sheet } from '../../components/index';
import { exerciseSelectOptions } from '../exercises/grouping';
import { formatTarget } from '../routines/items';
import type { LineChoice } from './routine-adjustments';
import type { RoutineLineProgress } from './routine-progress';
import styles from './AdjustLineSheet.module.css';

export interface AdjustLineSheetProps {
  /** La línea que se ajusta, o `null` con la hoja cerrada. */
  readonly line: RoutineLineProgress | null;
  /** Todos los ejercicios del usuario, archivados incluidos: la rutina puede nombrar uno. */
  readonly exercises: readonly TrackedExercise[];
  readonly onClose: () => void;
  readonly onChoose: (line: RoutineLineProgress, choice: LineChoice) => void;
  readonly onRestore: (line: RoutineLineProgress) => void;
}

/**
 * Cambiar una línea de la rutina solo para hoy: otro ejercicio si la máquina no está, u otro
 * número de series. No toca la rutina ni manda nada al Worker: se guarda al momento en el
 * dispositivo, así que funciona igual sin cobertura.
 */
export function AdjustLineSheet({
  line,
  exercises,
  onClose,
  onChoose,
  onRestore,
}: AdjustLineSheetProps) {
  return (
    <Sheet open={line !== null} onClose={onClose} title="Cambiar solo para hoy">
      {line !== null && (
        <AdjustLineForm
          line={line}
          exercises={exercises}
          onChoose={(choice) => {
            onChoose(line, choice);
          }}
          onRestore={() => {
            onRestore(line);
          }}
        />
      )}
    </Sheet>
  );
}

interface AdjustLineFormProps {
  readonly line: RoutineLineProgress;
  readonly exercises: readonly TrackedExercise[];
  readonly onChoose: (choice: LineChoice) => void;
  readonly onRestore: () => void;
}

function AdjustLineForm({ line, exercises, onChoose, onRestore }: AdjustLineFormProps) {
  const [trackedExerciseId, setTrackedExerciseId] = useState(line.item.trackedExerciseId);
  const [targetSets, setTargetSets] = useState<number | null>(line.item.targetSets);

  // Se ofrecen los activos, más los que ya nombra la línea aunque estén archivados: sin
  // ellos el selector no podría enseñar lo que la rutina pide ni lo que se eligió.
  const named = new Set([line.item.trackedExerciseId, line.planned.trackedExerciseId]);
  const options = exerciseSelectOptions(
    exercises.filter((exercise) => exercise.archivedAt === null || named.has(exercise.id)),
  );
  const plannedName =
    exercises.find((exercise) => exercise.id === line.planned.trackedExerciseId)?.name ??
    'Ejercicio no disponible';

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (targetSets === null) return;
    onChoose({ trackedExerciseId, targetSets });
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <Notice title={`En la rutina: ${plannedName}`}>
        {formatTarget(line.planned)}. Lo que cambies aquí vale para esta sesión: la rutina se queda
        como está.
      </Notice>

      <Select
        label="Ejercicio"
        value={trackedExerciseId}
        onChange={(value) => {
          if (options.some((option) => option.value === value)) setTrackedExerciseId(value);
        }}
        options={options}
      />

      <NumberField
        label="Series"
        value={targetSets}
        onChange={setTargetSets}
        min={1}
        max={MAX_ROUTINE_TARGET_SETS}
        hint={
          line.doneSets > 0
            ? `Llevas ${String(line.doneSets)}: las que ya hiciste siguen contando.`
            : 'Las repeticiones siguen siendo las de la rutina.'
        }
      />

      <Button type="submit" size="lg" fullWidth disabled={targetSets === null}>
        Guardar para hoy
      </Button>

      {line.adjusted && (
        <Button variant="secondary" fullWidth onClick={onRestore}>
          Volver a lo de la rutina
        </Button>
      )}
    </form>
  );
}
