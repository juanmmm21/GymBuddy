import type { BodyPart, CatalogFilters } from '@gymbuddy/shared';
import { Button, Select } from '../../components/index';
import {
  NO_FILTER,
  equipmentFilterOptions,
  hasCatalogFilters,
  muscleFilterOptions,
  offersMuscleFilter,
  withCatalogFilter,
} from './filters';
import styles from './CatalogFilterBar.module.css';

export interface CatalogFilterBarProps {
  readonly filters: CatalogFilters;
  /** La parte del cuerpo de la página; `null` en la búsqueda, que abarca el catálogo entero. */
  readonly bodyPart: BodyPart | null;
  readonly onChange: (filters: CatalogFilters) => void;
}

/** Equipamiento y músculo en dos desplegables nativos, y un botón para quitarlos si hay alguno. */
export function CatalogFilterBar({ filters, bodyPart, onChange }: CatalogFilterBarProps) {
  const showMuscle = offersMuscleFilter(bodyPart);

  return (
    <section className={styles.bar} aria-label="Filtros del catálogo">
      <div className={styles.fields}>
        <Select
          label="Equipamiento"
          value={filters.equipment ?? NO_FILTER}
          options={equipmentFilterOptions()}
          onChange={(value) => {
            onChange(withCatalogFilter(filters, 'equipment', value));
          }}
        />
        {showMuscle && (
          <Select
            label="Músculo"
            value={filters.muscle ?? NO_FILTER}
            options={muscleFilterOptions(bodyPart)}
            onChange={(value) => {
              onChange(withCatalogFilter(filters, 'muscle', value));
            }}
          />
        )}
      </div>
      {hasCatalogFilters(filters) && (
        <Button
          variant="ghost"
          className={styles.clear}
          onClick={() => {
            onChange({});
          }}
        >
          Quitar filtros
        </Button>
      )}
    </section>
  );
}
