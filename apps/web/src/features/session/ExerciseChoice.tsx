import type { TrackedExercise } from '@gymbuddy/shared';
import { BODY_PART_LABELS } from '../catalog/labels';
import { UNGROUPED_LABEL } from '../exercises/grouping';
import { ExerciseMedia } from './ExerciseMedia';
import styles from './ExerciseChoice.module.css';

export interface ExerciseChoiceProps {
  readonly exercise: TrackedExercise;
  /** Abre la lista para elegir otro. */
  readonly onChange: () => void;
}

/**
 * El ejercicio elegido en la hoja de registrar, con su miniatura. Casi siempre ya viene bien (la
 * línea de la rutina o la última serie, `logExerciseIdFor`), así que no estorba: es una fila, y
 * tocarla entera abre la lista para cambiarlo.
 */
export function ExerciseChoice({ exercise, onChange }: ExerciseChoiceProps) {
  const bodyPart =
    exercise.bodyPart === null ? UNGROUPED_LABEL : BODY_PART_LABELS[exercise.bodyPart];

  return (
    <div className={styles.field}>
      <span className={styles.label} aria-hidden="true">
        Ejercicio
      </span>
      <button
        type="button"
        className={styles.choice}
        aria-label={`Cambiar ejercicio: ${exercise.name}`}
        onClick={onChange}
      >
        <ExerciseMedia exercise={exercise} />
        <span className={styles.text}>
          <span className={styles.name}>{exercise.name}</span>
          <span className={styles.detail}>
            {exercise.archivedAt === null ? bodyPart : `${bodyPart} · archivado`}
          </span>
        </span>
        <span className={styles.action} aria-hidden="true">
          Cambiar
        </span>
      </button>
    </div>
  );
}
