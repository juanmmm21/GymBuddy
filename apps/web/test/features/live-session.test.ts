import { describe, expect, it } from 'vitest';
import { summarizeLiveSession } from '../../src/features/home/live-session';
import { UNKNOWN_EXERCISE_NAME } from '../../src/features/session/summary';
import { activeSession, benchPress, squat } from '../fixtures';

describe('summarizeLiveSession', () => {
  const [firstSet] = activeSession.sets;
  if (firstSet === undefined) throw new Error('La sesión de las fixtures trae una serie');

  it('cuenta ejercicios, series y volumen, y toma la última serie con su equipamiento', () => {
    const summary = summarizeLiveSession(activeSession, [benchPress, squat]);

    expect(summary).toMatchObject({ exerciseCount: 1, setCount: 1, volumeGrams: 660_000 });
    expect(summary.lastSet).toEqual({
      exerciseName: benchPress.name,
      equipment: 'barbell',
      weight: '82.50',
      reps: 8,
      completedAt: firstSet.completedAt,
    });
  });

  it('la última es la de hora más reciente aunque la cola la deje antes en la lista', () => {
    const later = {
      ...firstSet,
      id: 'b1b2c3d4-0000-4000-8000-000000000001',
      trackedExerciseId: squat.id,
      weight: '100.00',
      reps: 5,
      completedAt: new Date(Date.parse(firstSet.completedAt) + 60_000).toISOString(),
    };
    const summary = summarizeLiveSession({ ...activeSession, sets: [later, firstSet] }, [
      benchPress,
      squat,
    ]);

    expect(summary.lastSet?.exerciseName).toBe(squat.name);
  });

  it('sin series no hay última, y un ejercicio desconocido no rompe la tarjeta', () => {
    expect(summarizeLiveSession({ ...activeSession, sets: [] }, []).lastSet).toBeNull();
    expect(summarizeLiveSession(activeSession, []).lastSet).toMatchObject({
      exerciseName: UNKNOWN_EXERCISE_NAME,
      equipment: null,
    });
  });
});
