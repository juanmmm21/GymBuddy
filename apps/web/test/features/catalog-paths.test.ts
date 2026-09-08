import { muscleSchema } from '@gymbuddy/shared';
import { describe, expect, it } from 'vitest';
import {
  MUSCLE_LABELS,
  categoryLabel,
  equipmentLabel,
  humanize,
} from '../../src/features/catalog/labels';
import {
  bodyPartPath,
  catalogExercisePath,
  catalogExerciseRef,
  parseBodyPart,
  parseMuscle,
  splitCatalogId,
} from '../../src/features/catalog/paths';

describe('rutas del catálogo', () => {
  it('parte el catalogId en músculo y slug', () => {
    expect(splitCatalogId('pectorals/barbell-bench-press')).toEqual({
      muscle: 'pectorals',
      slug: 'barbell-bench-press',
    });
  });

  it('rechaza lo que no tiene la forma "{muscle}/{slug}" o un músculo desconocido', () => {
    expect(splitCatalogId('barbell-bench-press')).toBeNull();
    expect(splitCatalogId('pectorals/')).toBeNull();
    expect(splitCatalogId('/bench')).toBeNull();
    expect(splitCatalogId('chest/barbell-bench-press')).toBeNull();
  });

  it('construye la ruta de la ficha codificando el slug', () => {
    expect(catalogExercisePath({ muscle: 'quads', slug: 'sissy squat' })).toBe(
      '/catalog/quads/sissy%20squat',
    );
    expect(bodyPartPath('legs')).toBe('/catalog/legs');
  });

  it('la referencia de un resumen cae al músculo del propio ejercicio si el id no cuadra', () => {
    expect(
      catalogExerciseRef({ catalogId: 'pectorals/archer-push-up', muscle: 'pectorals' }),
    ).toEqual({
      muscle: 'pectorals',
      slug: 'archer-push-up',
    });
    expect(catalogExerciseRef({ catalogId: 'archer-push-up', muscle: 'pectorals' })).toEqual({
      muscle: 'pectorals',
      slug: 'archer-push-up',
    });
  });

  it('valida los segmentos de la URL contra los enums del contrato', () => {
    expect(parseBodyPart('chest')).toBe('chest');
    expect(parseBodyPart('pectorals')).toBeNull();
    expect(parseBodyPart(undefined)).toBeNull();
    expect(parseMuscle('pectorals')).toBe('pectorals');
    expect(parseMuscle('chest')).toBeNull();
  });
});

describe('etiquetas del catálogo', () => {
  it('cada músculo del contrato tiene nombre', () => {
    for (const muscle of muscleSchema.options) {
      expect(MUSCLE_LABELS[muscle]).not.toBe('');
    }
  });

  it('traduce el equipamiento y la categoría conocidos', () => {
    expect(equipmentLabel('bodyweight')).toBe('Peso corporal');
    expect(equipmentLabel('ez-bar')).toBe('Barra Z');
    expect(categoryLabel('plyometrics')).toBe('Pliometría');
  });

  it('un valor nuevo del catálogo se pinta legible en vez de romper la ficha', () => {
    expect(equipmentLabel('trap-bar')).toBe('Trap bar');
    expect(categoryLabel('mobility_work')).toBe('Mobility work');
    expect(humanize('')).toBe('');
    expect(humanize('---')).toBe('---');
  });
});
