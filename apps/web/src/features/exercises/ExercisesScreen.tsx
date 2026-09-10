import type { Locale, TrackedExercise } from '@gymbuddy/shared';
import { useId } from 'react';
import { Link } from 'react-router';
import { useTrackedExercises } from '../../api/queries';
import { useSession } from '../../auth/SessionProvider';
import { ScreenHeader } from '../../app/ScreenHeader';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import { Badge, Notice, Surface } from '../../components/index';
import { formatWeightLabel } from '../../lib/format';
import { MUSCLE_LABELS } from '../catalog/labels';
import { CATALOG_PATH } from '../catalog/paths';
import { ROUTINES_PATH } from '../routines/paths';
import { groupExercisesByBodyPart, type ExerciseGroup } from './grouping';
import { ORIGIN_LABELS } from './labels';
import { trackedExercisePath } from './paths';
import styles from './ExercisesScreen.module.css';

/** Los ejercicios que sigues, por parte del cuerpo y cada uno con su peso habitual. */
export function ExercisesScreen() {
  const { session } = useSession();
  const locale = session?.user.locale ?? 'es';
  const exercises = useTrackedExercises();

  return (
    <>
      <ScreenHeader
        title="Mis ejercicios"
        subtitle="Lo que haces de verdad, con tu peso habitual"
        action={
          <Link to={ROUTINES_PATH} className={styles.headerLink}>
            Rutinas
          </Link>
        }
      />
      <AsyncContent query={exercises}>
        {(items) =>
          items.length === 0 ? (
            <Notice
              title="Todavía no sigues ningún ejercicio"
              action={<Link to={CATALOG_PATH}>Abrir el catálogo</Link>}
            >
              Elige uno del catálogo o registra una serie desde el bot de Telegram.
            </Notice>
          ) : (
            <div className={styles.groups}>
              {groupExercisesByBodyPart(items).map((group) => (
                <GroupSection key={group.label} group={group} locale={locale} />
              ))}
            </div>
          )
        }
      </AsyncContent>
    </>
  );
}

interface GroupSectionProps {
  readonly group: ExerciseGroup;
  readonly locale: Locale;
}

function GroupSection({ group, locale }: GroupSectionProps) {
  const titleId = useId();
  return (
    <section className={styles.group} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.groupTitle}>
        {group.label}
      </h2>
      <ul className={styles.list}>
        {group.items.map((exercise) => (
          <ExerciseRow key={exercise.id} exercise={exercise} locale={locale} />
        ))}
      </ul>
    </section>
  );
}

interface ExerciseRowProps {
  readonly exercise: TrackedExercise;
  readonly locale: Locale;
}

/** Una fila es un enlace a la ficha: ahí están el historial y la edición. */
function ExerciseRow({ exercise, locale }: ExerciseRowProps) {
  return (
    <Surface as="li" padding="none">
      <Link to={trackedExercisePath(exercise.id)} className={styles.row}>
        <span className={styles.text}>
          <span className={styles.name}>{exercise.name}</span>
          <span className={styles.meta}>
            {exercise.muscle !== null
              ? MUSCLE_LABELS[exercise.muscle]
              : ORIGIN_LABELS[exercise.origin]}
          </span>
        </span>
        {exercise.workingWeight === null ? (
          <Badge>Sin series</Badge>
        ) : (
          <Badge tone="accent">
            {formatWeightLabel(exercise.workingWeight.weight, locale)} ×{' '}
            {exercise.workingWeight.reps}
          </Badge>
        )}
      </Link>
    </Surface>
  );
}
