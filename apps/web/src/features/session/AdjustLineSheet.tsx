import { MAX_ROUTINE_TARGET_SETS, type TrackedExercise } from '@gymbuddy/shared';
import { useState, type FormEvent } from 'react';
import { Button, Notice, NumberField, Select, Sheet } from '../../components/index';
import { useLastPresent } from '../../hooks/use-last-present';
import { exerciseSelectOptions } from '../exercises/grouping';
import { formatTarget } from '../routines/items';
import type { LineChoice } from './routine-adjustments';
import type { RoutineLineProgress } from './routine-progress';
import styles from './AdjustLineSheet.module.css';
import { t } from '../../i18n/index';

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
  // La hoja tarda en bajarse lo que dure su animación, y en ese rato ya no hay línea: sin recordar
  // la última, se iría en blanco.
  const shown = useLastPresent(line);

  return (
    <Sheet
      open={line !== null}
      onClose={onClose}
      title={t('Cambiar solo para hoy', 'Change for today only')}
    >
      {shown !== null && (
        <AdjustLineForm
          line={shown}
          exercises={exercises}
          onChoose={(choice) => {
            onChoose(shown, choice);
          }}
          onRestore={() => {
            onRestore(shown);
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
    t('Ejercicio no disponible', 'Exercise not available');

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (targetSets === null) return;
    onChoose({ trackedExerciseId, targetSets });
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <Notice title={t(`En la rutina: ${plannedName}`, `In the routine: ${plannedName}`)}>
        {formatTarget(line.planned)}.{' '}
        {t(
          'Lo que cambies aquí vale para esta sesión: la rutina se queda como está.',
          'What you change here applies to this session: the routine stays as it is.',
        )}
      </Notice>

      <Select
        label={t('Ejercicio', 'Exercise')}
        value={trackedExerciseId}
        onChange={(value) => {
          if (options.some((option) => option.value === value)) setTrackedExerciseId(value);
        }}
        options={options}
      />

      <NumberField
        label={t('Series', 'Sets')}
        value={targetSets}
        onChange={setTargetSets}
        min={1}
        max={MAX_ROUTINE_TARGET_SETS}
        hint={
          line.doneSets > 0
            ? t(
                `Llevas ${String(line.doneSets)}: las que ya hiciste siguen contando.`,
                `You’ve done ${String(line.doneSets)}: those still count.`,
              )
            : t(
                'Las repeticiones siguen siendo las de la rutina.',
                'The reps stay as in the routine.',
              )
        }
      />

      <Button type="submit" size="lg" fullWidth disabled={targetSets === null}>
        {t('Guardar para hoy', 'Save for today')}
      </Button>

      {line.adjusted && (
        <Button variant="secondary" fullWidth onClick={onRestore}>
          {t('Volver a lo de la rutina', 'Back to the routine’s plan')}
        </Button>
      )}
    </form>
  );
}
