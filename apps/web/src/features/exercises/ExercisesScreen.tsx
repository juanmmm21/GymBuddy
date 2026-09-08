import type { TrackedExercise } from '@gymbuddy/shared';
import { useTrackedExercises } from '../../api/queries';
import { useSession } from '../../auth/SessionProvider';
import { ScreenHeader } from '../../app/ScreenHeader';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import { Badge, Notice, Surface } from '../../components/index';
import { formatWeightLabel } from '../../lib/format';
import { BODY_PART_LABELS } from '../catalog/labels';
import styles from './ExercisesScreen.module.css';

/** Los ejercicios que sigues, cada uno con su peso habitual. */
export function ExercisesScreen() {
  const { session } = useSession();
  const locale = session?.user.locale ?? 'es';
  const exercises = useTrackedExercises();

  return (
    <>
      <ScreenHeader
        title="Mis ejercicios"
        subtitle="Lo que haces de verdad, con tu peso habitual"
      />
      <AsyncContent query={exercises}>
        {(items) =>
          items.length === 0 ? (
            <Notice title="Todavía no sigues ningún ejercicio">
              Añádelos desde el catálogo o regístralos desde el bot de Telegram.
            </Notice>
          ) : (
            <ul className={styles.list}>
              {items.map((exercise) => (
                <ExerciseRow key={exercise.id} exercise={exercise} locale={locale} />
              ))}
            </ul>
          )
        }
      </AsyncContent>
    </>
  );
}

function ExerciseRow({
  exercise,
  locale,
}: {
  readonly exercise: TrackedExercise;
  readonly locale: 'es' | 'en';
}) {
  return (
    <Surface as="li" className={styles.row}>
      <div className={styles.text}>
        <span className={styles.name}>{exercise.name}</span>
        {exercise.bodyPart !== null && (
          <span className={styles.meta}>{BODY_PART_LABELS[exercise.bodyPart]}</span>
        )}
      </div>
      {exercise.workingWeight === null ? (
        <Badge>Sin series</Badge>
      ) : (
        <Badge tone="accent">
          {formatWeightLabel(exercise.workingWeight.weight, locale)} × {exercise.workingWeight.reps}
        </Badge>
      )}
    </Surface>
  );
}
