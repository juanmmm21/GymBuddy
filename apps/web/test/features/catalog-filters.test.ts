import { describe, expect, it } from 'vitest';
import {
  EQUIPMENT_FILTER_ORDER,
  NO_FILTER,
  applyCatalogFiltersToParams,
  bodyPartFilterOptions,
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

  it('la parte del cuerpo ofrece «Todas» y las siete, en el orden del catálogo', () => {
    const options = bodyPartFilterOptions();

    expect(options[0]).toEqual({ value: NO_FILTER, label: 'Todas' });
    expect(options.slice(1).map((option) => option.value)).toEqual([
      'chest',
      'back',
      'legs',
      'shoulders',
      'arms',
      'core',
      'cardio',
    ]);
    expect(options.find((option) => option.value === 'back')?.label).toBe('Espalda');
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

  it('elegir una parte del cuerpo conserva el músculo si es suyo y lo suelta si no', () => {
    expect(withCatalogFilter({ muscle: 'lats', equipment: 'cable' }, 'bodyPart', 'back')).toEqual({
      bodyPart: 'back',
      muscle: 'lats',
      equipment: 'cable',
    });
    expect(withCatalogFilter({ muscle: 'lats', equipment: 'cable' }, 'bodyPart', 'legs')).toEqual({
      bodyPart: 'legs',
      equipment: 'cable',
    });
  });

  it('una parte con un solo músculo suelta el músculo, que ya no se ofrece', () => {
    expect(withCatalogFilter({ muscle: 'delts' }, 'bodyPart', 'shoulders')).toEqual({
      bodyPart: 'shoulders',
    });
  });

  it('volver a «Todas» quita la parte y deja el músculo', () => {
    const next = withCatalogFilter({ bodyPart: 'back', muscle: 'lats' }, 'bodyPart', NO_FILTER);

    expect(next).toEqual({ muscle: 'lats' });
    expect('bodyPart' in next).toBe(false);
  });

  it('«Todo» quita la clave en vez de dejarla vacía', () => {
    const next = withCatalogFilter({ equipment: 'cable', muscle: 'lats' }, 'muscle', NO_FILTER);

    expect(next).toEqual({ equipment: 'cable' });
    expect('muscle' in next).toBe(false);
  });

  it('dice si hay filtros y los nombra para el aviso', () => {
    expect(hasCatalogFilters({})).toBe(false);
    expect(hasCatalogFilters({ muscle: 'lats' })).toBe(true);
    expect(hasCatalogFilters({ bodyPart: 'back' })).toBe(true);
    expect(describeCatalogFilters({ bodyPart: 'back', equipment: 'cable' })).toBe(
      'Polea · Espalda',
    );
    expect(describeCatalogFilters({ bodyPart: 'back', muscle: 'lats' })).toBe('Dorsales');
    expect(describeCatalogFilters({ equipment: 'cable', muscle: 'lats' })).toBe('Polea · Dorsales');
    expect(describeCatalogFilters({ equipment: 'hammer' })).toBe('Hammer');
  });
});
