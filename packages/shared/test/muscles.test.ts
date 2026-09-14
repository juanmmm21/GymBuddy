import { describe, expect, it } from 'vitest';
import {
  MUSCLE_BODY_PART,
  bodyPartOfMuscle,
  isMuscleInBodyPart,
  musclesOfBodyPart,
} from '../src/domain/muscles';
import { bodyPartSchema, muscleSchema } from '../src/schemas/catalog';

describe('bodyPartOfMuscle', () => {
  it('cubre los diecinueve músculos del contrato, ni uno más', () => {
    expect(Object.keys(MUSCLE_BODY_PART).sort()).toEqual([...muscleSchema.options].sort());
  });

  it('pone cada músculo donde lo pone el catálogo', () => {
    expect(bodyPartOfMuscle('pectorals')).toBe('chest');
    expect(bodyPartOfMuscle('serratus-anterior')).toBe('chest');
    expect(bodyPartOfMuscle('glutes')).toBe('legs');
    expect(bodyPartOfMuscle('delts')).toBe('shoulders');
    expect(bodyPartOfMuscle('spine')).toBe('back');
    expect(bodyPartOfMuscle('abs')).toBe('core');
    expect(bodyPartOfMuscle('cardio')).toBe('cardio');
  });
});

describe('musclesOfBodyPart', () => {
  it('reparte todos los músculos entre las siete partes sin repetir ninguno', () => {
    const all = bodyPartSchema.options.flatMap((bodyPart) => musclesOfBodyPart(bodyPart));
    expect(all).toHaveLength(muscleSchema.options.length);
    expect(new Set(all).size).toBe(all.length);
  });

  it('da los de una parte en el orden del contrato', () => {
    expect(musclesOfBodyPart('legs')).toEqual([
      'abductors',
      'adductors',
      'calves',
      'glutes',
      'hamstrings',
      'quads',
    ]);
    expect(musclesOfBodyPart('shoulders')).toEqual(['delts']);
  });

  it('ninguna parte del cuerpo se queda sin músculos', () => {
    for (const bodyPart of bodyPartSchema.options) {
      expect(musclesOfBodyPart(bodyPart).length).toBeGreaterThan(0);
    }
  });
});

describe('isMuscleInBodyPart', () => {
  it('acepta que falte cualquiera de los dos', () => {
    expect(isMuscleInBodyPart(null, 'legs')).toBe(true);
    expect(isMuscleInBodyPart('glutes', null)).toBe(true);
    expect(isMuscleInBodyPart(undefined, undefined)).toBe(true);
  });

  it('rechaza que se contradigan', () => {
    expect(isMuscleInBodyPart('glutes', 'legs')).toBe(true);
    expect(isMuscleInBodyPart('glutes', 'chest')).toBe(false);
  });
});
