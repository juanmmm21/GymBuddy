import type { CatalogExerciseSummary } from '@gymbuddy/shared';
import { Link } from 'react-router';
import { Surface } from '../../components/index';
import { ExerciseThumb } from './ExerciseThumb';
import { MUSCLE_LABELS, equipmentLabel } from './labels';
import { catalogExercisePath, catalogExerciseRef } from './paths';
import styles from './CatalogExerciseList.module.css';

export interface CatalogExerciseListProps {
  readonly items: readonly CatalogExerciseSummary[];
}

/**
 * Filas de ejercicios del catálogo, cada una un enlace a su ficha y con su animación en pequeño.
 * Cada GIF pesa cientos de KB: por eso solo baja el de las filas que se ven y no entra en la caché
 * offline (ver `ExerciseThumb` y `preview.ts`). Juan lo eligió así sabiendo que gasta datos.
 */
export function CatalogExerciseList({ items }: CatalogExerciseListProps) {
  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <Surface as="li" key={item.catalogId} padding="none">
          <Link to={catalogExercisePath(catalogExerciseRef(item))} className={styles.row}>
            <ExerciseThumb key={item.gifUrl} gifUrl={item.gifUrl} />
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
