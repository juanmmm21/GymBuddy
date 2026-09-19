import type { CatalogExerciseSummary } from '@gymbuddy/shared';
import { Link } from 'react-router';
import type { BackLink } from '../../app/ScreenHeader';
import { Surface, listEntranceProps } from '../../components/index';
import { ExerciseThumb } from './ExerciseThumb';
import { MUSCLE_LABELS, equipmentLabel } from './labels';
import { catalogBackState } from './navigation';
import { catalogExercisePath, catalogExerciseRef } from './paths';
import styles from './CatalogExerciseList.module.css';

export interface CatalogExerciseListProps {
  readonly items: readonly CatalogExerciseSummary[];
  /** A dónde vuelve la ficha que se abra desde aquí: la lista con lo que tenía puesto. */
  readonly backTo: BackLink;
}

/**
 * Filas de ejercicios del catálogo, cada una un enlace a su ficha y con su animación en pequeño.
 * Cada GIF pesa cientos de KB: por eso solo baja el de las filas que se ven y no entra en la caché
 * offline (ver `ExerciseThumb` y `preview.ts`). Juan lo eligió así sabiendo que gasta datos.
 *
 * Las filas entran escalonadas por su posición y con tope (`listEntranceProps`): una página nueva
 * de «Cargar más» entra ella sola, porque las que ya estaban montadas no se vuelven a animar.
 */
export function CatalogExerciseList({ items, backTo }: CatalogExerciseListProps) {
  const state = catalogBackState(backTo);

  return (
    <ul className={styles.list}>
      {items.map((item, index) => (
        <Surface as="li" key={item.catalogId} padding="none" {...listEntranceProps(index)}>
          <Link
            to={catalogExercisePath(catalogExerciseRef(item))}
            state={state}
            className={styles.row}
          >
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
