import type { RoutineItem, RoutineItemInput } from '@gymbuddy/shared';
import { describe, expect, it } from 'vitest';
import {
  describeRoutineSize,
  formatRepsRange,
  formatTarget,
  hasInvertedRange,
  moveItem,
  removeItem,
  toItemInput,
  toItemInputs,
  upsertItem,
  type ItemValues,
} from '../../src/features/routines/items';
import { routinePath } from '../../src/features/routines/paths';
import { benchPress, squat } from '../fixtures';

const FIRST: RoutineItemInput = {
  id: '10000000-0000-4000-8000-000000000001',
  trackedExerciseId: benchPress.id,
  targetSets: 4,
  targetRepsMin: 6,
  targetRepsMax: 8,
};

const SECOND: RoutineItemInput = {
  id: '10000000-0000-4000-8000-000000000002',
  trackedExerciseId: squat.id,
  targetSets: 3,
  targetRepsMin: 5,
  targetRepsMax: 5,
};

const THIRD: RoutineItemInput = {
  id: '10000000-0000-4000-8000-000000000003',
  trackedExerciseId: benchPress.id,
  targetSets: 2,
  targetRepsMin: 12,
  targetRepsMax: 15,
};

const ITEMS: readonly RoutineItemInput[] = [FIRST, SECOND, THIRD];

describe('toItemInputs', () => {
  it('quita el orden y deja las líneas en la posición que dice su orderIndex', () => {
    const saved: RoutineItem[] = [
      { ...SECOND, orderIndex: 1 },
      { ...THIRD, orderIndex: 2 },
      { ...FIRST, orderIndex: 0 },
    ];

    const inputs = toItemInputs(saved);

    expect(inputs).toEqual([FIRST, SECOND, THIRD]);
    expect(inputs[0]).not.toHaveProperty('orderIndex');
  });
});

describe('moveItem', () => {
  it('sube y baja una línea un puesto sin tocar la lista de entrada', () => {
    expect(moveItem(ITEMS, 1, 'up')).toEqual([SECOND, FIRST, THIRD]);
    expect(moveItem(ITEMS, 1, 'down')).toEqual([FIRST, THIRD, SECOND]);
    expect(ITEMS).toEqual([FIRST, SECOND, THIRD]);
  });

  it('en el borde no hay nada que mover', () => {
    expect(moveItem(ITEMS, 0, 'up')).toBeNull();
    expect(moveItem(ITEMS, 2, 'down')).toBeNull();
    expect(moveItem(ITEMS, 7, 'up')).toBeNull();
    expect(moveItem([], 0, 'down')).toBeNull();
  });
});

describe('upsertItem y removeItem', () => {
  it('una línea nueva va al final', () => {
    const added: RoutineItemInput = { ...SECOND, id: '10000000-0000-4000-8000-000000000009' };

    expect(upsertItem([FIRST, SECOND], added)).toEqual([FIRST, SECOND, added]);
  });

  it('una línea editada conserva su identificador y su puesto', () => {
    const edited: RoutineItemInput = { ...SECOND, targetSets: 5, trackedExerciseId: benchPress.id };

    expect(upsertItem(ITEMS, edited)).toEqual([FIRST, edited, THIRD]);
  });

  it('quitar una línea deja las demás en su orden, aunque repitan ejercicio', () => {
    expect(removeItem(ITEMS, FIRST.id)).toEqual([SECOND, THIRD]);
    expect(removeItem(ITEMS, '10000000-0000-4000-8000-00000000dead')).toEqual(ITEMS);
  });
});

describe('toItemInput', () => {
  const values: ItemValues = { ...FIRST };

  it('una línea completa y dentro de los topes se puede mandar', () => {
    expect(toItemInput(values)).toEqual(FIRST);
  });

  it('un campo vacío, un rango al revés o un tope pasado no se mandan', () => {
    expect(toItemInput({ ...values, targetSets: null })).toBeNull();
    expect(toItemInput({ ...values, targetRepsMin: 9, targetRepsMax: 8 })).toBeNull();
    expect(toItemInput({ ...values, targetSets: 21 })).toBeNull();
  });

  it('solo el rango al revés cuenta como rango invertido', () => {
    expect(hasInvertedRange({ ...values, targetRepsMin: 9, targetRepsMax: 8 })).toBe(true);
    expect(hasInvertedRange({ ...values, targetRepsMin: 8, targetRepsMax: 8 })).toBe(false);
    expect(hasInvertedRange({ ...values, targetRepsMin: null, targetRepsMax: 8 })).toBe(false);
  });
});

describe('textos de una rutina', () => {
  it('escribe el objetivo como en una hoja de gimnasio', () => {
    expect(formatTarget(FIRST)).toBe('4 series × 6–8 reps');
    expect(formatTarget({ targetSets: 1, targetRepsMin: 5, targetRepsMax: 5 })).toBe(
      '1 serie × 5 reps',
    );
    expect(formatRepsRange(1, 1)).toBe('1 rep');
  });

  it('cuenta los ejercicios distintos y suma las series de todos los bloques', () => {
    expect(describeRoutineSize(ITEMS)).toBe('2 ejercicios · 9 series');
    expect(describeRoutineSize([FIRST])).toBe('1 ejercicio · 4 series');
    expect(describeRoutineSize([])).toBe('Sin ejercicios');
  });

  it('el editor cuelga de /routines con el id de la rutina', () => {
    expect(routinePath(FIRST.id)).toBe(`/routines/${FIRST.id}`);
  });
});
