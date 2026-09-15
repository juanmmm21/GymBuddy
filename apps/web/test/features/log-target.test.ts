import type { RoutineItem, StrengthSetEntry } from '@gymbuddy/shared';
import { describe, expect, it } from 'vitest';
import { logExerciseIdFor } from '../../src/features/session/log-target';
import { routineProgress } from '../../src/features/session/routine-progress';
import { latestSet } from '../../src/features/session/summary';
import { benchPress, customCurl, squat } from '../fixtures';

function setOf(
  trackedExerciseId: string,
  overrides: Partial<StrengthSetEntry> = {},
): StrengthSetEntry {
  return {
    id: crypto.randomUUID(),
    trackedExerciseId,
    kind: 'strength',
    orderIndex: 0,
    weight: '60.00',
    reps: 8,
    rpe: null,
    isWarmup: false,
    completedAt: '2026-09-15T18:00:00.000Z',
    ...overrides,
  };
}

function itemOf(id: string, trackedExerciseId: string, orderIndex: number): RoutineItem {
  return { id, trackedExerciseId, orderIndex, targetSets: 2, targetRepsMin: 8, targetRepsMax: 12 };
}

const ROUTINE_ITEMS = [
  itemOf('0b8a7b52-7c1e-4b5b-9d55-3f0f7d9d1a01', benchPress.id, 0),
  itemOf('0b8a7b52-7c1e-4b5b-9d55-3f0f7d9d1a02', squat.id, 1),
];

describe('logExerciseIdFor', () => {
  it('sin rutina abre con el ejercicio de la última serie, no con el primero de la lista', () => {
    const sets = [
      setOf(benchPress.id, { completedAt: '2026-09-15T18:00:00.000Z' }),
      setOf(squat.id, { completedAt: '2026-09-15T18:10:00.000Z' }),
    ];

    expect(logExerciseIdFor(null, sets, null)).toBe(squat.id);
  });

  it('manda la hora y no el orden de la lista: la cola offline puede dejarlas desordenadas', () => {
    const sets = [
      setOf(customCurl.id, { completedAt: '2026-09-15T18:20:00.000Z' }),
      // Con otra zona horaria: por texto parecería posterior, por instante es anterior.
      setOf(squat.id, { completedAt: '2026-09-15T20:15:00.000+02:00' }),
    ];

    expect(logExerciseIdFor(null, sets, null)).toBe(customCurl.id);
  });

  it('un calentamiento también cuenta: después suele venir la serie buena del mismo', () => {
    const sets = [
      setOf(benchPress.id, { completedAt: '2026-09-15T18:00:00.000Z' }),
      setOf(squat.id, { isWarmup: true, completedAt: '2026-09-15T18:05:00.000Z' }),
    ];

    expect(logExerciseIdFor(null, sets, null)).toBe(squat.id);
  });

  it('con series, la ficha de la URL ya no decide; sin ninguna, sí', () => {
    const sets = [setOf(benchPress.id)];

    expect(logExerciseIdFor(null, sets, squat.id)).toBe(benchPress.id);
    expect(logExerciseIdFor(null, [], squat.id)).toBe(squat.id);
  });

  it('sin series ni URL deja que la hoja elija', () => {
    expect(logExerciseIdFor(null, [], null)).toBeNull();
  });

  it('con rutina manda la línea que toca, aunque la última serie sea de otro ejercicio', () => {
    // Press de banca terminado (2 de 2): toca la sentadilla, aunque se acabe de hacer un curl.
    const sets = [
      setOf(benchPress.id, { orderIndex: 0, completedAt: '2026-09-15T18:00:00.000Z' }),
      setOf(benchPress.id, { orderIndex: 1, completedAt: '2026-09-15T18:03:00.000Z' }),
      setOf(customCurl.id, { orderIndex: 2, completedAt: '2026-09-15T18:06:00.000Z' }),
    ];
    const progress = routineProgress(ROUTINE_ITEMS, sets);

    expect(logExerciseIdFor(progress, sets, null)).toBe(squat.id);
  });

  it('con la rutina ya terminada vuelve a mandar la última serie', () => {
    const sets = [
      setOf(benchPress.id, { orderIndex: 0, completedAt: '2026-09-15T18:00:00.000Z' }),
      setOf(benchPress.id, { orderIndex: 1, completedAt: '2026-09-15T18:03:00.000Z' }),
      setOf(squat.id, { orderIndex: 2, completedAt: '2026-09-15T18:06:00.000Z' }),
      setOf(squat.id, { orderIndex: 3, completedAt: '2026-09-15T18:09:00.000Z' }),
    ];
    const progress = routineProgress(ROUTINE_ITEMS, sets);

    expect(progress.current).toBeNull();
    expect(logExerciseIdFor(progress, sets, benchPress.id)).toBe(squat.id);
  });
});

describe('latestSet', () => {
  it('a igual hora gana la que va después en la lista', () => {
    const first = setOf(benchPress.id);
    const second = setOf(squat.id);

    expect(latestSet([first, second])).toBe(second);
  });

  it('ignora una hora que no se puede leer y sin series devuelve null', () => {
    const good = setOf(benchPress.id);

    expect(latestSet([good, setOf(squat.id, { completedAt: 'no es una hora' })])).toBe(good);
    expect(latestSet([])).toBeNull();
  });
});
