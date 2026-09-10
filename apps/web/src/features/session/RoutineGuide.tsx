import type { Routine, TrackedExercise } from '@gymbuddy/shared';
import { useId } from 'react';
import { Badge, Notice, Surface } from '../../components/index';
import { cx } from '../../lib/cx';
import { formatTarget } from '../routines/items';
import type { RoutineLineProgress, RoutineProgress } from './routine-progress';
import styles from './RoutineGuide.module.css';

export interface RoutineGuideProps {
  readonly routine: Routine;
  readonly progress: RoutineProgress;
  /** Con los archivados: una rutina puede nombrar uno, y su línea tiene que seguir leyéndose. */
  readonly exercises: readonly TrackedExercise[];
  readonly onLogLine: (line: RoutineLineProgress) => void;
}

/**
 * El guion de la sesión: las líneas de la rutina en su orden, cuántas series lleva cada una
 * y cuál toca. Tocar una abre el registro con su ejercicio, que es lo que se hace entre
 * serie y serie con el móvil en una mano.
 */
export function RoutineGuide({ routine, progress, exercises, onLogLine }: RoutineGuideProps) {
  const titleId = useId();
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const total = progress.lines.length;

  return (
    <section className={styles.guide} aria-labelledby={titleId}>
      <div className={styles.head}>
        <h2 id={titleId} className={styles.title}>
          {routine.name}
        </h2>
        {total > 0 && (
          <span className={styles.count}>
            {progress.completedLines} de {total} hechos
          </span>
        )}
      </div>

      {total === 0 ? (
        <p className={styles.empty}>
          Esta rutina no tiene ejercicios: registra lo que hagas como siempre.
        </p>
      ) : (
        <ol className={styles.lines} aria-label="Guion de la rutina">
          {progress.lines.map((line, index) => (
            <GuideLine
              key={line.item.id}
              line={line}
              position={index + 1}
              exercise={exerciseById.get(line.item.trackedExerciseId) ?? null}
              current={progress.current?.item.id === line.item.id}
              onLog={() => {
                onLogLine(line);
              }}
            />
          ))}
        </ol>
      )}

      {total > 0 && progress.current === null && (
        <Notice tone="success" title="Rutina completada">
          Has hecho todas las series. Termina la sesión cuando quieras.
        </Notice>
      )}
    </section>
  );
}

interface GuideLineProps {
  readonly line: RoutineLineProgress;
  readonly position: number;
  /** `null` si el ejercicio ya no está en la lista del usuario: se pinta, pero no se registra. */
  readonly exercise: TrackedExercise | null;
  readonly current: boolean;
  readonly onLog: () => void;
}

function GuideLine({ line, position, exercise, current, onLog }: GuideLineProps) {
  const name = exercise?.name ?? 'Ejercicio no disponible';
  const { doneSets } = line;
  const { targetSets } = line.item;

  return (
    <Surface as="li" padding="none" className={cx(styles.line, current && styles.current)}>
      <button
        type="button"
        className={styles.lineMain}
        onClick={onLog}
        disabled={exercise === null}
        aria-current={current ? 'step' : undefined}
        aria-label={`Registrar ${name}, ${String(doneSets)} de ${String(targetSets)} series`}
      >
        <span className={styles.position}>{position}</span>
        <span className={styles.text}>
          <span className={styles.name}>{name}</span>
          <span className={styles.target}>{formatTarget(line.item)}</span>
        </span>
        {exercise !== null && exercise.archivedAt !== null && (
          <Badge tone="warning">Archivado</Badge>
        )}
        {current && <Badge tone="accent">Ahora</Badge>}
        <span className={cx(styles.progress, line.complete && styles.done)}>
          {doneSets}/{targetSets}
        </span>
      </button>
    </Surface>
  );
}
