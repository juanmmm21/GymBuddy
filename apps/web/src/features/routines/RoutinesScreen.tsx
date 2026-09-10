import type { Routine } from '@gymbuddy/shared';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { useRoutines } from '../../api/queries';
import { ScreenHeader, type BackLink } from '../../app/ScreenHeader';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import { Badge, Button, Notice, Surface } from '../../components/index';
import { EXERCISES_PATH } from '../exercises/paths';
import { CreateRoutineSheet } from './CreateRoutineSheet';
import { describeRoutineSize } from './items';
import { routinePath } from './paths';
import styles from './RoutinesScreen.module.css';

const BACK_TO_EXERCISES: BackLink = { to: EXERCISES_PATH, label: 'Mis ejercicios' };

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
        title="Rutinas"
        subtitle="Tus entrenamientos, con los ejercicios en orden"
        backTo={BACK_TO_EXERCISES}
        action={
          <Button variant="ghost" onClick={openCreate}>
            Nueva
          </Button>
        }
      />
      <AsyncContent query={routines}>
        {(items) => {
          const active = items.filter((routine) => routine.archivedAt === null);
          const archived = items.filter((routine) => routine.archivedAt !== null);

          return (
            <div className={styles.stack}>
              {active.length === 0 ? (
                <Notice
                  title="Todavía no tienes ninguna rutina"
                  action={
                    <Button variant="secondary" onClick={openCreate}>
                      Crear una rutina
                    </Button>
                  }
                >
                  Una rutina es la lista de ejercicios de un día de entrenamiento, en el orden en
                  que los haces.
                </Notice>
              ) : (
                <ul className={styles.list} aria-label="Tus rutinas">
                  {active.map((routine) => (
                    <RoutineRow key={routine.id} routine={routine} />
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
        Archivadas
      </h2>
      <ul className={styles.list}>
        {routines.map((routine) => (
          <RoutineRow key={routine.id} routine={routine} />
        ))}
      </ul>
    </section>
  );
}

/** Una fila es un enlace al editor: ahí se ordenan los ejercicios y se archiva. */
function RoutineRow({ routine }: { readonly routine: Routine }) {
  return (
    <Surface as="li" padding="none">
      <Link to={routinePath(routine.id)} className={styles.row}>
        <span className={styles.text}>
          <span className={styles.name}>{routine.name}</span>
          <span className={styles.meta}>{describeRoutineSize(routine.items)}</span>
        </span>
        {routine.archivedAt !== null && <Badge>Archivada</Badge>}
      </Link>
    </Surface>
  );
}
