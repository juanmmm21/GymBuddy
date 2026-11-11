import type { Routine, TrackedExercise } from '@gymbuddy/shared';
import { useId } from 'react';
import { Badge, Notice, Surface } from '../../components/index';
import { cx } from '../../lib/cx';
import { formatTarget } from '../routines/items';
import type { RoutineLineProgress, RoutineProgress } from './routine-progress';
import styles from './RoutineGuide.module.css';
import { t } from '../../i18n/index';

export interface RoutineGuideProps {
  readonly routine: Routine;
  readonly progress: RoutineProgress;
  /** Con los archivados: una rutina puede nombrar uno, y su línea tiene que seguir leyéndose. */
  readonly exercises: readonly TrackedExercise[];
  readonly onLogLine: (line: RoutineLineProgress) => void;
  /** Cambiar el ejercicio o las series de la línea solo para esta sesión. */
  readonly onAdjustLine: (line: RoutineLineProgress) => void;
}

/**
 * El guion de la sesión: las líneas de la rutina en su orden, cuántas series lleva cada una
 * y cuál toca. Tocar una abre el registro con su ejercicio, que es lo que se hace entre
 * serie y serie con el móvil en una mano.
 */
export function RoutineGuide({
  routine,
  progress,
  exercises,
  onLogLine,
  onAdjustLine,
}: RoutineGuideProps) {
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
            {t(
              `${String(progress.completedLines)} de ${String(total)} hechos`,
              `${String(progress.completedLines)} of ${String(total)} done`,
            )}
          </span>
        )}
      </div>

      {total === 0 ? (
        <p className={styles.empty}>
          {t(
            'Esta rutina no tiene ejercicios: registra lo que hagas como siempre.',
            'This routine has no exercises: log what you do as usual.',
          )}
        </p>
      ) : (
        <ol className={styles.lines} aria-label={t('Guion de la rutina', 'Routine plan')}>
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
              onAdjust={() => {
                onAdjustLine(line);
              }}
            />
          ))}
        </ol>
      )}

      {total > 0 && progress.current === null && (
        <Notice tone="success" title={t('Rutina completada', 'Routine completed')}>
          {t(
            'Has hecho todas las series. Termina la sesión cuando quieras.',
            'You’ve done all the sets. End the session whenever you like.',
          )}
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
  readonly onAdjust: () => void;
}

function GuideLine({ line, position, exercise, current, onLog, onAdjust }: GuideLineProps) {
  const name = exercise?.name ?? t('Ejercicio no disponible', 'Exercise not available');
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
        aria-label={t(
          `Registrar ${name}, ${String(doneSets)} de ${String(targetSets)} series`,
          `Log ${name}, ${String(doneSets)} of ${String(targetSets)} sets`,
        )}
      >
        <span className={styles.position}>{position}</span>
        <span className={styles.text}>
          <span className={styles.name}>{name}</span>
          <span className={styles.target}>{formatTarget(line.item)}</span>
        </span>
        {exercise !== null && exercise.archivedAt !== null && (
          <Badge tone="warning">{t('Archivado', 'Archived')}</Badge>
        )}
        {line.adjusted && <Badge>{t('Solo hoy', 'Today only')}</Badge>}
        {current && <Badge tone="accent">{t('Ahora', 'Now')}</Badge>}
        <span className={cx(styles.progress, line.complete && styles.done)}>
          {doneSets}/{targetSets}
        </span>
      </button>
      {/* Aparte del botón de registrar: un botón no puede ir dentro de otro. */}
      <button
        type="button"
        className={styles.adjust}
        onClick={onAdjust}
        aria-label={t(`Cambiar ${name} solo para hoy`, `Change ${name} for today only`)}
      >
        Ajustar
      </button>
    </Surface>
  );
}
