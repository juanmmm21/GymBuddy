import type { CatalogExerciseSummary } from '@gymbuddy/shared';
import { Link } from 'react-router';
import { Surface } from '../../components/index';
import { MUSCLE_LABELS, equipmentLabel } from './labels';
import { catalogExercisePath, catalogExerciseRef } from './paths';
import styles from './CatalogExerciseList.module.css';

export interface CatalogExerciseListProps {
  readonly items: readonly CatalogExerciseSummary[];
}

/**
 * Filas de ejercicios del catálogo, cada una un enlace a su ficha. Sin miniaturas a
 * propósito: los GIFs pesan cientos de KB cada uno y una lista de cincuenta se comería la
 * tarifa de datos del gimnasio antes de elegir nada. La animación se ve en la ficha.
 */
export function CatalogExerciseList({ items }: CatalogExerciseListProps) {
  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <Surface as="li" key={item.catalogId} padding="none">
          <Link to={catalogExercisePath(catalogExerciseRef(item))} className={styles.row}>
            <span className={styles.text}>
              <span className={styles.name}>{item.name}</span>
              <span className={styles.meta}>
                {MUSCLE_LABELS[item.muscle]} · {equipmentLabel(item.equipment)}
              </span>
            </span>
            <span className={styles.chevron} aria-hidden="true">
              ›
            </span>
          </Link>
        </Surface>
      ))}
    </ul>
  );
}
