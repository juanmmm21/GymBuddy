import { describe, expect, it } from 'vitest';
import {
  EQUIPMENT_FILTER_ORDER,
  NO_FILTER,
  applyCatalogFiltersToParams,
  describeCatalogFilters,
  equipmentFilterOptions,
  hasCatalogFilters,
  muscleFilterOptions,
  offersMuscleFilter,
  parseCatalogFilters,
  withCatalogFilter,
} from '../../src/features/catalog/filters';

describe('opciones de los filtros del catálogo', () => {
  it('el equipamiento ofrece «Todo» y los valores del tag, traducidos', () => {
    const options = equipmentFilterOptions();

    expect(options[0]).toEqual({ value: NO_FILTER, label: 'Todo' });
    expect(options.slice(1).map((option) => option.value)).toEqual(EQUIPMENT_FILTER_ORDER);
    expect(EQUIPMENT_FILTER_ORDER).toHaveLength(11);
    expect(options.find((option) => option.value === 'cable')?.label).toBe('Polea');
    expect(options.every((option) => option.label.length > 0)).toBe(true);
  });

  it('«Máquina» es el grupo y la máquina de palanca no sale aparte', () => {
    const options = equipmentFilterOptions();

    expect(options.find((option) => option.value === 'machine')?.label).toBe('Máquina');
    expect(options.some((option) => option.value === 'lever')).toBe(false);
    expect(options.some((option) => option.value === 'smith')).toBe(true);
  });

  it('dentro de una parte del cuerpo solo salen sus músculos', () => {
    expect(muscleFilterOptions('back').map((option) => option.value)).toEqual([
      NO_FILTER,
      'lats',
      'levator-scapulae',
      'spine',
      'traps',
      'upper-back',
    ]);
  });

  it('en la búsqueda salen los diecinueve, agrupados por parte del cuerpo', () => {
    const muscles = muscleFilterOptions(null).slice(1);

    expect(muscles).toHaveLength(19);
    expect(muscles[0]).toEqual({ value: 'pectorals', label: 'Pectorales', group: 'Pecho' });
    expect(muscles.at(-1)).toEqual({ value: 'cardio', label: 'Cardio', group: 'Cardio' });
  });

  it('no ofrece el músculo donde solo hay uno', () => {
    expect(offersMuscleFilter('shoulders')).toBe(false);
    expect(offersMuscleFilter('core')).toBe(false);
    expect(offersMuscleFilter('cardio')).toBe(false);
    expect(offersMuscleFilter('legs')).toBe(true);
    expect(offersMuscleFilter(null)).toBe(true);
  });
});

describe('filtros en la URL', () => {
  it('lee los dos filtros de la URL', () => {
    const params = new URLSearchParams('equipment=cable&muscle=lats');

    expect(parseCatalogFilters(params, 'back')).toEqual({ equipment: 'cable', muscle: 'lats' });
  });

  it('ignora lo que no es del contrato y el músculo de otra parte del cuerpo', () => {
    const params = new URLSearchParams('equipment=Polea%25&muscle=quads');

    expect(parseCatalogFilters(params, 'back')).toEqual({});
    expect(parseCatalogFilters(params, null)).toEqual({ muscle: 'quads' });
  });

  it('escribe los filtros sin tocar los demás parámetros y quita los vacíos', () => {
    const current = new URLSearchParams('otro=1&muscle=lats');

    const next = applyCatalogFiltersToParams(current, { equipment: 'cable' });

    expect(next.toString()).toBe('otro=1&equipment=cable');
    expect(current.toString()).toBe('otro=1&muscle=lats');
  });
});

describe('cambiar un filtro', () => {
  it('pone el valor elegido y conserva el otro filtro', () => {
    expect(withCatalogFilter({ muscle: 'lats' }, 'equipment', 'cable')).toEqual({
      equipment: 'cable',
      muscle: 'lats',
    });
  });

  it('«Todo» quita la clave en vez de dejarla vacía', () => {
    const next = withCatalogFilter({ equipment: 'cable', muscle: 'lats' }, 'muscle', NO_FILTER);

    expect(next).toEqual({ equipment: 'cable' });
    expect('muscle' in next).toBe(false);
  });

  it('dice si hay filtros y los nombra para el aviso', () => {
    expect(hasCatalogFilters({})).toBe(false);
    expect(hasCatalogFilters({ muscle: 'lats' })).toBe(true);
    expect(describeCatalogFilters({ equipment: 'cable', muscle: 'lats' })).toBe('Polea · Dorsales');
    expect(describeCatalogFilters({ equipment: 'hammer' })).toBe('Hammer');
  });
});
