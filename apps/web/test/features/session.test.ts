import type { SetEntry } from '@gymbuddy/shared';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REST_TARGET_SECONDS,
  REST_TARGETS_SECONDS,
  restStateAt,
} from '../../src/features/session/rest';
import {
  SESSION_EXERCISE_PARAM,
  SESSION_PATH,
  SESSION_ROUTINE_PARAM,
  sessionPathForExercise,
  sessionPathForRoutine,
} from '../../src/features/session/paths';
import {
  groupSetsByExercise,
  latestSetCompletedAt,
  summarizeSession,
  UNKNOWN_EXERCISE_NAME,
} from '../../src/features/session/summary';
import { benchPress, customCurl, pushRoutine, squat } from '../fixtures';

function setOf(
  overrides: Partial<SetEntry> & Pick<SetEntry, 'id' | 'trackedExerciseId'>,
): SetEntry {
  return {
    orderIndex: 0,
    weight: '80.00',
    reps: 8,
    rpe: null,
    isWarmup: false,
    completedAt: '2026-09-08T18:00:00.000Z',
    source: 'web',
    ...overrides,
  };
}

const firstBench = setOf({
  id: '11111111-1111-4111-8111-111111111111',
  trackedExerciseId: benchPress.id,
  completedAt: '2026-09-08T18:00:00.000Z',
});
const squatSet = setOf({
  id: '22222222-2222-4222-8222-222222222222',
  trackedExerciseId: squat.id,
  weight: '100.00',
  reps: 5,
  completedAt: '2026-09-08T18:10:00.000Z',
});
const secondBench = setOf({
  id: '33333333-3333-4333-8333-333333333333',
  trackedExerciseId: benchPress.id,
  orderIndex: 2,
  completedAt: '2026-09-08T18:20:00.000Z',
});

describe('groupSetsByExercise', () => {
  it('agrupa por ejercicio en el orden en que se tocó cada uno', () => {
    const groups = groupSetsByExercise([firstBench, squatSet, secondBench], [benchPress, squat]);

    expect(groups.map((group) => group.name)).toEqual(['Press de banca', 'Sentadilla con barra']);
    expect(groups[0]?.sets.map((set) => set.id)).toEqual([firstBench.id, secondBench.id]);
    expect(groups[1]?.sets).toEqual([squatSet]);
  });

  it('una serie de un ejercicio que no está en el listado se sigue viendo', () => {
    const groups = groupSetsByExercise([firstBench], [customCurl]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.name).toBe(UNKNOWN_EXERCISE_NAME);
  });

  it('sin series no hay grupos', () => {
    expect(groupSetsByExercise([], [benchPress])).toEqual([]);
  });
});

describe('summarizeSession', () => {
  it('cuenta series, ejercicios y volumen, y el calentamiento no suma volumen', () => {
    const warmup = setOf({
      id: '44444444-4444-4444-8444-444444444444',
      trackedExerciseId: benchPress.id,
      weight: '60.00',
      reps: 10,
      isWarmup: true,
    });

    const totals = summarizeSession([warmup, firstBench, squatSet]);

    expect(totals.setCount).toBe(3);
    expect(totals.workingSetCount).toBe(2);
    expect(totals.exerciseCount).toBe(2);
    // 80 kg × 8 + 100 kg × 5, en gramos, sin el calentamiento.
    expect(totals.volumeGrams).toBe(80_000 * 8 + 100_000 * 5);
  });

  it('una sesión vacía no tiene nada que contar', () => {
    expect(summarizeSession([])).toEqual({
      setCount: 0,
      workingSetCount: 0,
      exerciseCount: 0,
      volumeGrams: 0,
    });
  });
});

describe('latestSetCompletedAt', () => {
  it('devuelve la más reciente aunque las series lleguen desordenadas', () => {
    expect(latestSetCompletedAt([secondBench, firstBench, squatSet])).toBe(secondBench.completedAt);
  });

  it('compara por instante y no por texto: otra zona horaria no engaña al orden', () => {
    const laterInAnotherZone = setOf({
      id: '55555555-5555-4555-8555-555555555555',
      trackedExerciseId: benchPress.id,
      // Las 18:30 UTC escritas en hora de Madrid: alfabéticamente van antes que "18:20Z".
      completedAt: '2026-09-08T20:30:00.000+02:00',
    });

    expect(latestSetCompletedAt([secondBench, laterInAnotherZone])).toBe(
      laterInAnotherZone.completedAt,
    );
  });

  it('sin series no hay descanso que contar', () => {
    expect(latestSetCompletedAt([])).toBeNull();
  });
});

describe('restStateAt', () => {
  const lastSetAt = '2026-09-08T18:00:00.000Z';
  const at = (seconds: number) => Date.parse(lastSetAt) + seconds * 1000;

  it('cuenta desde la última serie hacia el objetivo', () => {
    const rest = restStateAt(lastSetAt, at(30), 120);

    expect(rest.elapsedSeconds).toBe(30);
    expect(rest.remainingSeconds).toBe(90);
    expect(rest.progress).toBeCloseTo(0.25);
    expect(rest.done).toBe(false);
  });

  it('cumplido el objetivo no queda tiempo ni se pasa del uno', () => {
    const rest = restStateAt(lastSetAt, at(300), 120);

    expect(rest.elapsedSeconds).toBe(300);
    expect(rest.remainingSeconds).toBe(0);
    expect(rest.progress).toBe(1);
    expect(rest.done).toBe(true);
  });

  it('un reloj del móvil adelantado no da un cronómetro al revés', () => {
    const rest = restStateAt(lastSetAt, at(-45), 120);

    expect(rest.elapsedSeconds).toBe(0);
    expect(rest.progress).toBe(0);
  });

  it('el objetivo por defecto es uno de los ofrecidos', () => {
    expect(REST_TARGETS_SECONDS).toContain(DEFAULT_REST_TARGET_SECONDS);
  });
});

describe('rutas de la sesión', () => {
  it('el ejercicio elegido viaja en la query', () => {
    expect(sessionPathForExercise(benchPress.id)).toBe(
      `${SESSION_PATH}?${SESSION_EXERCISE_PARAM}=${benchPress.id}`,
    );
  });

  it('la rutina que guía la sesión también viaja en la query', () => {
    expect(sessionPathForRoutine(pushRoutine.id)).toBe(
      `${SESSION_PATH}?${SESSION_ROUTINE_PARAM}=${pushRoutine.id}`,
    );
  });
});
