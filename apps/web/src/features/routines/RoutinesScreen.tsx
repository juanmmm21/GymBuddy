import type { Routine } from '@gymbuddy/shared';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { useRoutines } from '../../api/queries';
import { ScreenHeader, type BackLink } from '../../app/ScreenHeader';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import {
  Badge,
  Button,
  Notice,
  SkeletonList,
  Surface,
  listEntranceProps,
} from '../../components/index';
import { EXERCISES_PATH } from '../exercises/paths';
import { CreateRoutineSheet } from './CreateRoutineSheet';
import { describeRoutineSize } from './items';
import { routinePath } from './paths';
import styles from './RoutinesScreen.module.css';
import { t } from '../../i18n/index';

function backToExercises(): BackLink {
  return { to: EXERCISES_PATH, label: t('Mis ejercicios', 'My exercises') };
}

/** Las rutinas del usuario: las que hace, y al final las que dejó de hacer. */
export function RoutinesScreen() {
  // Con las archivadas: es la misma clave que usa el editor, así que abrir una rutina
  // desde aquí no vuelve a pedir nada, y una archivada sigue pudiendo recuperarse.
  const routines = useRoutines({ includeArchived: true });
  const [creating, setCreating] = useState(false);

  const openCreate = (): void => {
    setCreating(true);
  };

  return (
    <>
      <ScreenHeader
        title={t('Rutinas', 'Routines')}
        subtitle={t(
          'Tus entrenamientos, con los ejercicios en orden',
          'Your workouts, with the exercises in order',
        )}
        backTo={backToExercises()}
        action={
          <Button variant="ghost" onClick={openCreate}>
            {t('Nueva', 'New')}
          </Button>
        }
      />
      <AsyncContent query={routines} skeleton={<SkeletonList rows={4} />}>
        {(items) => {
          const active = items.filter((routine) => routine.archivedAt === null);
          const archived = items.filter((routine) => routine.archivedAt !== null);

          return (
            <div className={styles.stack}>
              {active.length === 0 ? (
                <Notice
                  title={t('Todavía no tienes ninguna rutina', 'You don’t have any routines yet')}
                  action={
                    <Button variant="secondary" onClick={openCreate}>
                      {t('Crear una rutina', 'Create a routine')}
                    </Button>
                  }
                >
                  {t(
                    'Una rutina es la lista de ejercicios de un día de entrenamiento, en el orden en que los haces.',
                    'A routine is the list of exercises for a training day, in the order you do them.',
                  )}
                </Notice>
              ) : (
                <ul className={styles.list} aria-label={t('Tus rutinas', 'Your routines')}>
                  {active.map((routine, index) => (
                    <RoutineRow key={routine.id} routine={routine} index={index} />
                  ))}
                </ul>
              )}

              {archived.length > 0 && <ArchivedSection routines={archived} />}
            </div>
          );
        }}
      </AsyncContent>

      <CreateRoutineSheet
        open={creating}
        onClose={() => {
          setCreating(false);
        }}
      />
    </>
  );
}

function ArchivedSection({ routines }: { readonly routines: readonly Routine[] }) {
  const titleId = useId();

  return (
    <section className={styles.section} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.sectionTitle}>
        {t('Archivadas', 'Archived')}
      </h2>
      <ul className={styles.list}>
        {routines.map((routine, index) => (
          <RoutineRow key={routine.id} routine={routine} index={index} />
        ))}
      </ul>
    </section>
  );
}

/** Una fila es un enlace al editor: ahí se ordenan los ejercicios y se archiva. */
function RoutineRow({
  routine,
  index,
}: {
  readonly routine: Routine;
  /** Su sitio dentro de su lista: las archivadas caen por su cuenta, detrás de su título. */
  readonly index: number;
}) {
  return (
    <Surface as="li" padding="none" {...listEntranceProps(index)}>
      <Link to={routinePath(routine.id)} className={styles.row}>
        <span className={styles.text}>
          <span className={styles.name}>{routine.name}</span>
          <span className={styles.meta}>{describeRoutineSize(routine.items)}</span>
        </span>
        {routine.archivedAt !== null && <Badge>{t('Archivada', 'Archived')}</Badge>}
      </Link>
    </Surface>
  );
}
