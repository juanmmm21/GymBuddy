import type { BodyPart, CatalogSearchFilters } from '@gymbuddy/shared';
import { Button, Select } from '../../components/index';
import {
  NO_FILTER,
  bodyPartFilterOptions,
  equipmentFilterOptions,
  hasCatalogFilters,
  muscleFilterOptions,
  offersMuscleFilter,
  withCatalogFilter,
} from './filters';
import styles from './CatalogFilterBar.module.css';
import { t } from '../../i18n/index';

export interface CatalogFilterBarProps {
  readonly filters: CatalogSearchFilters;
  /**
   * La parte del cuerpo de la página; `null` en la búsqueda, que abarca el catálogo entero y por eso
   * deja elegir la parte como un filtro más.
   */
  readonly bodyPart: BodyPart | null;
  readonly onChange: (filters: CatalogSearchFilters) => void;
}

/**
 * Equipamiento y músculo en desplegables nativos —en la búsqueda, también la parte del cuerpo— y un
 * botón para quitarlos si hay alguno. Con una parte elegida en la búsqueda, el músculo se comporta
 * como en la página de esa parte: solo los suyos, y nada si tiene uno solo.
 */
export function CatalogFilterBar({ filters, bodyPart, onChange }: CatalogFilterBarProps) {
  const offersBodyPart = bodyPart === null;
  const muscleScope = bodyPart ?? filters.bodyPart ?? null;
  const showMuscle = offersMuscleFilter(muscleScope);

  return (
    <section className={styles.bar} aria-label={t('Filtros del catálogo', 'Catalogue filters')}>
      <div className={styles.fields}>
        {offersBodyPart && (
          <Select
            label={t('Parte del cuerpo', 'Body part')}
            value={filters.bodyPart ?? NO_FILTER}
            options={bodyPartFilterOptions()}
            onChange={(value) => {
              onChange(withCatalogFilter(filters, 'bodyPart', value));
            }}
          />
        )}
        {showMuscle && (
          <Select
            label={t('Músculo', 'Muscle')}
            value={filters.muscle ?? NO_FILTER}
            options={muscleFilterOptions(muscleScope)}
            onChange={(value) => {
              onChange(withCatalogFilter(filters, 'muscle', value));
            }}
          />
        )}
        <Select
          label={t('Equipamiento', 'Equipment')}
          value={filters.equipment ?? NO_FILTER}
          options={equipmentFilterOptions()}
          onChange={(value) => {
            onChange(withCatalogFilter(filters, 'equipment', value));
          }}
        />
      </div>
      {hasCatalogFilters(filters) && (
        <Button
          variant="ghost"
          className={styles.clear}
          onClick={() => {
            onChange({});
          }}
        >
          {t('Quitar filtros', 'Clear filters')}
        </Button>
      )}
    </section>
  );
}
