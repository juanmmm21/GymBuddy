import type { RoutineItem, StrengthSetEntry } from '@gymbuddy/shared';
import { describe, expect, it } from 'vitest';
import { restKindAfter, routineProgress } from '../../src/features/session/routine-progress';
import { benchPress, squat } from '../fixtures';

const item = (trackedExerciseId: string, orderIndex: number, targetSets: number): RoutineItem => ({
  id: `a0000000-0000-4000-8000-00000000000${String(orderIndex)}`,
  trackedExerciseId,
  orderIndex,
  targetSets,
  targetRepsMin: 6,
  targetRepsMax: 8,
});

let minute = 0;
function set(trackedExerciseId: string, isWarmup = false): StrengthSetEntry {
  minute += 1;
  return {
    id: crypto.randomUUID(),
    trackedExerciseId,
    kind: 'strength',
    orderIndex: minute,
    weight: '80.00',
    reps: 8,
    rpe: null,
    isWarmup,
    completedAt: new Date(Date.UTC(2026, 8, 14, 18, minute)).toISOString(),
  };
}

describe('restKindAfter', () => {
  const items = [item(benchPress.id, 0, 2), item(squat.id, 1, 3)];

  it('sin rutina siempre es descanso entre series', () => {
    expect(restKindAfter(null, [set(benchPress.id)])).toBe('set');
  });

  it('a mitad de las series de un ejercicio es descanso entre series', () => {
    const sets = [set(benchPress.id)];

    expect(restKindAfter(routineProgress(items, sets), sets)).toBe('set');
  });

  it('terminada su línea y con otro ejercicio por delante, es cambio de ejercicio', () => {
    const sets = [set(benchPress.id), set(benchPress.id)];

    expect(restKindAfter(routineProgress(items, sets), sets)).toBe('exercise');
  });

  it('tras un calentamiento o con la rutina terminada no alarga nada', () => {
    const warmup = [set(benchPress.id), set(benchPress.id), set(squat.id, true)];
    expect(restKindAfter(routineProgress(items, warmup), warmup)).toBe('set');

    const done = [
      set(benchPress.id),
      set(benchPress.id),
      set(squat.id),
      set(squat.id),
      set(squat.id),
    ];
    expect(restKindAfter(routineProgress(items, done), done)).toBe('set');
  });
});
