import type { Locale, TrackedExercise, WeightUnit } from '@gymbuddy/shared';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { useTrackedExercises } from '../../api/queries';
import { useSession } from '../../auth/SessionProvider';
import { ScreenHeader } from '../../app/ScreenHeader';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import { Badge, Button, Notice, Surface } from '../../components/index';
import { splitSetWeight } from '../../lib/format';
import { MUSCLE_LABELS } from '../catalog/labels';
import { CATALOG_PATH } from '../catalog/paths';
import { ROUTINES_PATH } from '../routines/paths';
import { CreateExerciseSheet } from './CreateExerciseSheet';
import { groupExercisesByBodyPart, type ExerciseGroup } from './grouping';
import { ORIGIN_LABELS } from './labels';
import { trackedExercisePath } from './paths';
import { useWeightUnits } from './use-weight-units';
import { weightUnitFor, type WeightUnitsByExercise } from './weight-unit-store';
import styles from './ExercisesScreen.module.css';

/** Los ejercicios que sigues, por parte del cuerpo y cada uno con su peso habitual. */
export function ExercisesScreen() {
  const { session } = useSession();
  const locale = session?.user.locale ?? 'es';
  const exercises = useTrackedExercises();
  const weightUnits = useWeightUnits();
  const [creating, setCreating] = useState(false);
  const openCreate = (): void => {
    setCreating(true);
  };

  const createButton = (
    <Button variant="secondary" fullWidth onClick={openCreate}>
      Crear ejercicio propio
    </Button>
  );

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
            <div className={styles.groups}>
              <Notice
                title="Todavía no sigues ningún ejercicio"
                action={<Link to={CATALOG_PATH}>Abrir el catálogo</Link>}
              >
                Elige uno del catálogo para empezar a seguirlo.
              </Notice>
              {createButton}
            </div>
          ) : (
            <div className={styles.groups}>
              {groupExercisesByBodyPart(items).map((group) => (
                <GroupSection
                  key={group.label}
                  group={group}
                  weightUnits={weightUnits}
                  locale={locale}
                />
              ))}
              {createButton}
            </div>
          )
        }
      </AsyncContent>

      <CreateExerciseSheet
        open={creating}
        onClose={() => {
          setCreating(false);
        }}
      />
    </>
  );
}

interface GroupSectionProps {
  readonly group: ExerciseGroup;
  readonly weightUnits: WeightUnitsByExercise;
  readonly locale: Locale;
}

function GroupSection({ group, weightUnits, locale }: GroupSectionProps) {
  const titleId = useId();
  return (
    <section className={styles.group} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.groupTitle}>
        {group.label}
      </h2>
      <ul className={styles.list}>
        {group.items.map((exercise) => (
          <ExerciseRow
            key={exercise.id}
            exercise={exercise}
            weightUnit={weightUnitFor(weightUnits, exercise.id)}
            locale={locale}
          />
        ))}
      </ul>
    </section>
  );
}

interface ExerciseRowProps {
  readonly exercise: TrackedExercise;
  readonly weightUnit: WeightUnit;
  readonly locale: Locale;
}

/**
 * Una fila es un enlace a la ficha: ahí están el historial y la edición. En libras, los kilos van en
 * la línea de abajo y no en la etiqueta, que no parte línea y le quitaría el ancho al nombre.
 */
function ExerciseRow({ exercise, weightUnit, locale }: ExerciseRowProps) {
  const working =
    exercise.workingWeight === null
      ? null
      : splitSetWeight(exercise.workingWeight.weight, weightUnit, locale);
  const origin =
    exercise.muscle !== null ? MUSCLE_LABELS[exercise.muscle] : ORIGIN_LABELS[exercise.origin];
  return (
    <Surface as="li" padding="none">
      <Link to={trackedExercisePath(exercise.id)} className={styles.row}>
        <span className={styles.text}>
          <span className={styles.name}>{exercise.name}</span>
          <span className={styles.meta}>
            {working?.kilograms == null ? origin : `${origin} · ${working.kilograms}`}
          </span>
        </span>
        {exercise.workingWeight === null || working === null ? (
          <Badge>Sin series</Badge>
        ) : (
          <Badge tone="accent">
            {working.main} × {exercise.workingWeight.reps}
          </Badge>
        )}
      </Link>
    </Surface>
  );
}
