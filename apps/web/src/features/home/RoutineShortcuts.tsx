import type { Routine } from '@gymbuddy/shared';
import { useId } from 'react';
import { Link } from 'react-router';
import { useRoutines } from '../../api/queries';
import { AsyncContent } from '../../components/async-content/AsyncContent';
import { Surface } from '../../components/index';
import { describeRoutineSize } from '../routines/items';
import { sessionPathForRoutine } from '../session/paths';
import styles from './RoutineShortcuts.module.css';

/**
 * Las rutinas como accesos de un toque junto a «Empezar a entrenar». Llevan su propia
 * consulta —la misma clave que el editor, con las archivadas— para que un fallo aquí no
 * tumbe el resto de Hoy.
 */
export function RoutineShortcuts() {
  const routines = useRoutines({ includeArchived: true });

  return (
    <AsyncContent query={routines}>
      {(items) => <ShortcutList routines={items.filter(isStartable)} />}
    </AsyncContent>
  );
}

/** Solo las que se siguen haciendo y tienen algo dentro: una vacía guiaría una sesión sin guion. */
export function isStartable(routine: Routine): boolean {
  return routine.archivedAt === null && routine.items.length > 0;
}

function ShortcutList({ routines }: { readonly routines: readonly Routine[] }) {
  const titleId = useId();
  if (routines.length === 0) return null;

  return (
    <section className={styles.section} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        O empieza una rutina
      </h2>
      <ul className={styles.list}>
        {routines.map((routine) => (
          <Surface as="li" padding="none" key={routine.id}>
            <Link to={sessionPathForRoutine(routine.id)} className={styles.row}>
              <span className={styles.name}>{routine.name}</span>
              <span className={styles.meta}>{describeRoutineSize(routine.items)}</span>
            </Link>
          </Surface>
        ))}
      </ul>
    </section>
  );
}
