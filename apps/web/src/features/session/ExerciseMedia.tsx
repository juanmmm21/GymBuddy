import type { TrackedExercise } from '@gymbuddy/shared';
import { ExerciseThumb } from '../catalog/ExerciseThumb';
import { exerciseInitials } from './exercise-picker';
import styles from './ExerciseMedia.module.css';

export interface ExerciseMediaProps {
  readonly exercise: Pick<TrackedExercise, 'name' | 'gifUrl'>;
}

/**
 * La miniatura de un ejercicio al elegirlo: su GIF si es del catálogo y sus iniciales si es propio,
 * en el mismo hueco, para que las filas no bailen. Decorativa: el nombre siempre va al lado.
 */
export function ExerciseMedia({ exercise }: ExerciseMediaProps) {
  if (exercise.gifUrl === null) {
    return (
      <span className={styles.initials} aria-hidden="true">
        {exerciseInitials(exercise.name)}
      </span>
    );
  }
  return <ExerciseThumb key={exercise.gifUrl} gifUrl={exercise.gifUrl} />;
}
