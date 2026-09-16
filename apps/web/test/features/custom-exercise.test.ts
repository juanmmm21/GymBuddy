import { describe, expect, it } from 'vitest';
import {
  bodyPartSelectOptions,
  muscleSelectOptions,
  offersUnilateral,
  reconcileMuscle,
  suggestedExerciseName,
  toCustomExerciseRequest,
  UNSELECTED,
} from '../../src/features/exercises/custom-exercise';

const EXERCISE_ID = '5b0e7c3d-2f41-4a8e-9c6b-1d7e3f5a9b20';

describe('opciones del alta propia', () => {
  it('pide elegir parte del cuerpo y las ofrece en el orden del catálogo', () => {
    expect(bodyPartSelectOptions().map((option) => option.label)).toEqual([
      'Elige una',
      'Pecho',
      'Espalda',
      'Piernas',
      'Hombros',
      'Brazos',
      'Core',
      'Cardio',
    ]);
    expect(bodyPartSelectOptions()[0]?.value).toBe(UNSELECTED);
  });

  it('solo ofrece los músculos de la parte elegida', () => {
    expect(muscleSelectOptions('arms').map((option) => option.label)).toEqual([
      'Sin concretar',
      'Bíceps',
      'Antebrazos',
      'Tríceps',
    ]);
    expect(muscleSelectOptions(null)).toEqual([{ value: UNSELECTED, label: 'Sin concretar' }]);
  });
});

describe('reconcileMuscle', () => {
  it('conserva el músculo si pertenece a la nueva parte y lo quita si no', () => {
    expect(reconcileMuscle('glutes', 'legs')).toBe('glutes');
    expect(reconcileMuscle('glutes', 'chest')).toBe(UNSELECTED);
    expect(reconcileMuscle('glutes', null)).toBe(UNSELECTED);
    expect(reconcileMuscle(UNSELECTED, 'legs')).toBe(UNSELECTED);
  });
});

describe('toCustomExerciseRequest', () => {
  it('arma el alta propia con el nombre recortado y el músculo opcional', () => {
    expect(
      toCustomExerciseRequest(EXERCISE_ID, {
        name: '  Hip thrust en máquina ',
        bodyPart: 'legs',
        muscle: 'glutes',
        unilateral: false,
      }),
    ).toEqual({
      id: EXERCISE_ID,
      origin: 'custom',
      name: 'Hip thrust en máquina',
      bodyPart: 'legs',
      muscle: 'glutes',
      unilateral: false,
    });

    expect(
      toCustomExerciseRequest(EXERCISE_ID, {
        name: 'Step up en polea',
        bodyPart: 'legs',
        muscle: UNSELECTED,
        unilateral: false,
      }),
    ).toMatchObject({ bodyPart: 'legs', muscle: null });
  });

  it('manda «a un brazo» si se marcó, salvo en cardio, que no lleva peso', () => {
    expect(
      toCustomExerciseRequest(EXERCISE_ID, {
        name: 'Remo en polea a una mano',
        bodyPart: 'back',
        muscle: UNSELECTED,
        unilateral: true,
      }),
    ).toMatchObject({ unilateral: true });

    expect(
      toCustomExerciseRequest(EXERCISE_ID, {
        name: 'Remo ergómetro',
        bodyPart: 'cardio',
        muscle: UNSELECTED,
        unilateral: true,
      }),
    ).toMatchObject({ unilateral: false });
  });

  it('no arma nada sin nombre o sin parte del cuerpo', () => {
    expect(
      toCustomExerciseRequest(EXERCISE_ID, {
        name: '   ',
        bodyPart: 'legs',
        muscle: UNSELECTED,
        unilateral: false,
      }),
    ).toBeNull();
    expect(
      toCustomExerciseRequest(EXERCISE_ID, {
        name: 'Hip thrust',
        bodyPart: UNSELECTED,
        muscle: UNSELECTED,
        unilateral: false,
      }),
    ).toBeNull();
  });

  it('no arma un par que el Worker rechazaría', () => {
    expect(
      toCustomExerciseRequest(EXERCISE_ID, {
        name: 'Hip thrust',
        bodyPart: 'chest',
        muscle: 'glutes',
        unilateral: false,
      }),
    ).toBeNull();
  });
});

describe('offersUnilateral', () => {
  it('pregunta «a un brazo» en cualquier parte con peso, no en cardio ni sin parte', () => {
    expect(offersUnilateral('back')).toBe(true);
    expect(offersUnilateral('arms')).toBe(true);
    expect(offersUnilateral('cardio')).toBe(false);
    expect(offersUnilateral(null)).toBe(false);
  });
});

describe('suggestedExerciseName', () => {
  it('pone lo buscado con mayúscula inicial y sin espacios de más', () => {
    expect(suggestedExerciseName('  hip   thrust máquina ')).toBe('Hip thrust máquina');
    expect(suggestedExerciseName('elíptica')).toBe('Elíptica');
    expect(suggestedExerciseName('   ')).toBe('');
  });
});
