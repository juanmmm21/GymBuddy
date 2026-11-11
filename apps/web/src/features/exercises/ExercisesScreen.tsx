import {
  parseKilogramsToGrams,
  type Locale,
  type TrackedExercise,
  type WorkingWeight,
} from '@gymbuddy/shared';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { useTrackedExercises } from '../../api/queries';
import { ScreenHeader } from '../../app/ScreenHeader';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import {
  Badge,
  Button,
  Notice,
  SkeletonList,
  Surface,
  listEntranceProps,
} from '../../components/index';
import { formatExerciseWeightLabel, formatWeightValue, perArm } from '../../lib/format';
import { muscleLabel } from '../catalog/labels';
import { CATALOG_PATH } from '../catalog/paths';
import { ROUTINES_PATH } from '../routines/paths';
import { ExerciseMedia } from '../session/ExerciseMedia';
import { CreateExerciseSheet } from './CreateExerciseSheet';
import { groupExercisesByBodyPart, type ExerciseGroup } from './grouping';
import { originLabel } from './labels';
import { trackedExercisePath } from './paths';
import styles from './ExercisesScreen.module.css';
import { t, useLocale } from '../../i18n/index';

/** Los ejercicios que sigues, por parte del cuerpo y cada uno con su peso habitual. */
export function ExercisesScreen() {
  const locale = useLocale();
  const exercises = useTrackedExercises();
  const [creating, setCreating] = useState(false);
  const openCreate = (): void => {
    setCreating(true);
  };

  const createButton = (
    <Button variant="secondary" fullWidth onClick={openCreate}>
      {t('Crear ejercicio propio', 'Create your own exercise')}
    </Button>
  );

  return (
    <>
      <ScreenHeader
        title={t('Mis ejercicios', 'My exercises')}
        subtitle={t(
          'Lo que haces de verdad, con tu peso habitual',
          'What you actually do, with your usual weight',
        )}
        action={
          <Link to={ROUTINES_PATH} className={styles.headerLink}>
            {t('Rutinas', 'Routines')}
          </Link>
        }
      />
      <AsyncContent query={exercises} skeleton={<SkeletonList rows={6} />}>
        {(items) =>
          items.length === 0 ? (
            <div className={styles.groups}>
              <Notice
                title={t(
                  'Todavía no sigues ningún ejercicio',
                  'You’re not tracking any exercise yet',
                )}
                action={
                  <Link to={CATALOG_PATH}>{t('Abrir el catálogo', 'Open the catalogue')}</Link>
                }
              >
                {t(
                  'Elige uno del catálogo para empezar a seguirlo.',
                  'Pick one from the catalogue to start tracking it.',
                )}
              </Notice>
              {createButton}
            </div>
          ) : (
            <div className={styles.groups}>
              {groupExercisesByBodyPart(items).map((group) => (
                <GroupSection key={group.label} group={group} locale={locale} />
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
        {group.items.map((exercise, index) => (
          <ExerciseRow key={exercise.id} exercise={exercise} locale={locale} index={index} />
        ))}
      </ul>
    </section>
  );
}

interface ExerciseRowProps {
  readonly exercise: TrackedExercise;
  readonly locale: Locale;
  /**
   * Su sitio dentro de su parte del cuerpo, no en la pantalla entera: cada grupo cae por su
   * cuenta, que es como se leen los títulos que los separan.
   */
  readonly index: number;
}

/**
 * Una fila es un enlace a la ficha: ahí están el historial y la edición. Lleva la misma miniatura
 * que al elegir ejercicio en la sesión (lo pidió Juan el 2026-10-13): se reconoce de un vistazo.
 */
function ExerciseRow({ exercise, locale, index }: ExerciseRowProps) {
  return (
    <Surface as="li" padding="none" {...listEntranceProps(index)}>
      <Link to={trackedExercisePath(exercise.id)} className={styles.row}>
        <ExerciseMedia exercise={exercise} />
        <span className={styles.text}>
          <span className={styles.name}>{exercise.name}</span>
          <span className={styles.meta}>
            {exercise.muscle !== null ? muscleLabel(exercise.muscle) : originLabel(exercise.origin)}
          </span>
        </span>
        {exercise.workingWeight === null ? (
          <Badge>{t('Sin series', 'No sets')}</Badge>
        ) : (
          <WeightFigure
            workingWeight={exercise.workingWeight}
            unilateral={exercise.unilateral}
            locale={locale}
          />
        )}
      </Link>
    </Surface>
  );
}

/**
 * El peso habitual como en el marcador: la cifra grande y debajo, pequeño, cuántas repeticiones y si
 * es por brazo. Se lee entero por su nombre, porque partido en dos piezas no se entendería.
 */
function WeightFigure({
  workingWeight,
  unilateral,
  locale,
}: {
  readonly workingWeight: WorkingWeight;
  readonly unilateral: boolean;
  readonly locale: Locale;
}) {
  const { weight, reps } = workingWeight;
  const spoken = `${formatExerciseWeightLabel(weight, locale, unilateral)} × ${String(reps)}`;

  return (
    <span className={styles.weight} role="img" aria-label={spoken}>
      <span className={styles.weightValue}>
        {formatWeightValue(parseKilogramsToGrams(weight), locale)}
      </span>
      <span className={styles.weightUnit}>
        kg{unilateral ? ` ${perArm()}` : ''} × {reps}
      </span>
    </span>
  );
}
