import type { RoutineItem } from '@gymbuddy/shared';
import { describe, expect, it } from 'vitest';
import {
  adjustRoutineItems,
  withLineChoice,
  withoutLineAdjustment,
} from '../../src/features/session/routine-adjustments';
import { benchPress, customCurl, squat } from '../fixtures';

const BENCH: RoutineItem = {
  id: '21000000-0000-4000-8000-000000000001',
  trackedExerciseId: benchPress.id,
  orderIndex: 0,
  targetSets: 3,
  targetRepsMin: 6,
  targetRepsMax: 8,
};
const SQUAT: RoutineItem = {
  id: '21000000-0000-4000-8000-000000000002',
  trackedExerciseId: squat.id,
  orderIndex: 1,
  targetSets: 3,
  targetRepsMin: 5,
  targetRepsMax: 5,
};

describe('adjustRoutineItems', () => {
  it('sin ajustes deja cada línea como la rutina', () => {
    const lines = adjustRoutineItems([BENCH, SQUAT], []);

    expect(lines).toEqual([
      { item: BENCH, planned: BENCH, adjusted: false },
      { item: SQUAT, planned: SQUAT, adjusted: false },
    ]);
  });

  it('cambia el ejercicio y las series de su línea, conservando id, orden y repeticiones', () => {
    const [bench, squatLine] = adjustRoutineItems(
      [BENCH, SQUAT],
      [{ itemId: BENCH.id, trackedExerciseId: customCurl.id, targetSets: 4 }],
    );

    expect(bench?.item).toEqual({ ...BENCH, trackedExerciseId: customCurl.id, targetSets: 4 });
    expect(bench?.planned).toBe(BENCH);
    expect(bench?.adjusted).toBe(true);
    expect(squatLine?.adjusted).toBe(false);
  });

  it('un ajuste de una línea que ya no está en la rutina se ignora', () => {
    const lines = adjustRoutineItems(
      [SQUAT],
      [{ itemId: BENCH.id, trackedExerciseId: customCurl.id, targetSets: null }],
    );

    expect(lines).toEqual([{ item: SQUAT, planned: SQUAT, adjusted: false }]);
  });
});

describe('withLineChoice', () => {
  it('guarda solo lo que difiere de la rutina', () => {
    const next = withLineChoice([], BENCH, { trackedExerciseId: benchPress.id, targetSets: 4 });

    expect(next).toEqual([{ itemId: BENCH.id, trackedExerciseId: null, targetSets: 4 }]);
  });

  it('elegir lo mismo que la rutina quita el ajuste', () => {
    const adjusted = withLineChoice([], BENCH, { trackedExerciseId: squat.id, targetSets: 3 });
    const back = withLineChoice(adjusted, BENCH, {
      trackedExerciseId: benchPress.id,
      targetSets: 3,
    });

    expect(back).toEqual([]);
  });

  it('sustituye el ajuste anterior de esa línea y respeta los de las demás', () => {
    const first = withLineChoice([], SQUAT, { trackedExerciseId: squat.id, targetSets: 5 });
    const second = withLineChoice(first, BENCH, {
      trackedExerciseId: customCurl.id,
      targetSets: 3,
    });
    const third = withLineChoice(second, BENCH, {
      trackedExerciseId: benchPress.id,
      targetSets: 2,
    });

    expect(third).toEqual([
      { itemId: SQUAT.id, trackedExerciseId: null, targetSets: 5 },
      { itemId: BENCH.id, trackedExerciseId: null, targetSets: 2 },
    ]);
  });
});

describe('withoutLineAdjustment', () => {
  it('quita solo el de esa línea', () => {
    const adjustments = [
      { itemId: BENCH.id, trackedExerciseId: customCurl.id, targetSets: null },
      { itemId: SQUAT.id, trackedExerciseId: null, targetSets: 4 },
    ];

    expect(withoutLineAdjustment(adjustments, BENCH.id)).toEqual([adjustments[1]]);
  });
});
