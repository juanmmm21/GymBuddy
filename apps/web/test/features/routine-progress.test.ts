import type { RoutineItem, SetEntry } from '@gymbuddy/shared';
import { describe, expect, it } from 'vitest';
import {
  describeNextSet,
  lineForNextSet,
  routineProgress,
} from '../../src/features/session/routine-progress';
import { benchPress, customCurl, squat } from '../fixtures';

function itemOf(
  overrides: Partial<RoutineItem> & Pick<RoutineItem, 'id' | 'trackedExerciseId' | 'orderIndex'>,
): RoutineItem {
  return { targetSets: 3, targetRepsMin: 8, targetRepsMax: 12, ...overrides };
}

let nextSet = 0;

/** Una serie con su `orderIndex` correlativo: el reparto sigue el orden en que se hicieron. */
function setOf(trackedExerciseId: string, overrides: Partial<SetEntry> = {}): SetEntry {
  const orderIndex = nextSet;
  nextSet += 1;
  return {
    id: `30000000-0000-4000-8000-${String(orderIndex).padStart(12, '0')}`,
    trackedExerciseId,
    orderIndex,
    weight: '80.00',
    reps: 8,
    rpe: null,
    isWarmup: false,
    completedAt: '2026-09-10T18:00:00.000Z',
    ...overrides,
  };
}

const BENCH = itemOf({
  id: '20000000-0000-4000-8000-000000000001',
  trackedExerciseId: benchPress.id,
  orderIndex: 0,
  targetSets: 2,
});
const SQUAT = itemOf({
  id: '20000000-0000-4000-8000-000000000002',
  trackedExerciseId: squat.id,
  orderIndex: 1,
  targetSets: 2,
});
/** Un segundo bloque de press de banca al final: el mismo ejercicio en dos líneas. */
const BENCH_AGAIN = itemOf({
  id: '20000000-0000-4000-8000-000000000003',
  trackedExerciseId: benchPress.id,
  orderIndex: 2,
  targetSets: 1,
  targetRepsMin: 12,
  targetRepsMax: 15,
});

function doneSets(items: readonly RoutineItem[], sets: readonly SetEntry[]): number[] {
  return routineProgress(items, sets).lines.map((line) => line.doneSets);
}

describe('routineProgress', () => {
  it('una rutina vacía no tiene nada que tocar', () => {
    const progress = routineProgress([], [setOf(benchPress.id)]);

    expect(progress.lines).toEqual([]);
    expect(progress.current).toBeNull();
    expect(progress.completedLines).toBe(0);
  });

  it('sin series toca la primera línea', () => {
    const progress = routineProgress([BENCH, SQUAT], []);

    expect(progress.lines.map((line) => line.doneSets)).toEqual([0, 0]);
    expect(progress.current?.item.id).toBe(BENCH.id);
  });

  it('ordena las líneas por su orderIndex, no por cómo llegan', () => {
    const progress = routineProgress([SQUAT, BENCH], []);

    expect(progress.lines.map((line) => line.item.id)).toEqual([BENCH.id, SQUAT.id]);
  });

  it('el calentamiento no cuenta', () => {
    expect(doneSets([BENCH], [setOf(benchPress.id, { isWarmup: true })])).toEqual([0]);
  });

  it('una serie de un ejercicio que no está en la rutina no se reparte', () => {
    expect(doneSets([BENCH, SQUAT], [setOf(customCurl.id)])).toEqual([0, 0]);
  });

  it('el mismo ejercicio llena su primer bloque antes de pasar al segundo', () => {
    const sets = [setOf(benchPress.id), setOf(benchPress.id), setOf(benchPress.id)];

    expect(doneSets([BENCH, SQUAT, BENCH_AGAIN], sets)).toEqual([2, 0, 1]);
  });

  it('lo que se hace de más cuenta en el último bloque de ese ejercicio', () => {
    const sets = [setOf(squat.id), setOf(squat.id), setOf(squat.id)];
    const progress = routineProgress([BENCH, SQUAT], sets);

    expect(progress.lines[1]?.doneSets).toBe(3);
    expect(progress.lines[1]?.complete).toBe(true);
  });

  it('reparte por el orden en que se hicieron las series, no por cómo llegan', () => {
    const first = setOf(benchPress.id, { reps: 5 });
    const second = setOf(benchPress.id, { reps: 6 });
    const third = setOf(benchPress.id, { reps: 7 });
    const progress = routineProgress([BENCH, BENCH_AGAIN], [third, first, second]);

    expect(progress.lines.map((line) => line.doneSets)).toEqual([2, 1]);
  });

  it('sigue en la línea que se está haciendo aunque haya una anterior a medias', () => {
    // Máquina ocupada: se salta la banca después de una serie y se empieza la sentadilla.
    const sets = [setOf(benchPress.id), setOf(squat.id)];

    expect(routineProgress([BENCH, SQUAT], sets).current?.item.id).toBe(SQUAT.id);
  });

  it('terminada la que se estaba haciendo, toca la primera pendiente en el orden', () => {
    const sets = [setOf(benchPress.id), setOf(squat.id), setOf(squat.id)];

    expect(routineProgress([BENCH, SQUAT], sets).current?.item.id).toBe(BENCH.id);
  });

  it('con todas las líneas hechas no toca ninguna', () => {
    const sets = [setOf(benchPress.id), setOf(benchPress.id), setOf(squat.id), setOf(squat.id)];
    const progress = routineProgress([BENCH, SQUAT], sets);

    expect(progress.current).toBeNull();
    expect(progress.completedLines).toBe(2);
  });
});

describe('lineForNextSet', () => {
  it('apunta al primer bloque sin terminar del ejercicio', () => {
    const progress = routineProgress([BENCH, SQUAT, BENCH_AGAIN], [setOf(benchPress.id)]);

    expect(lineForNextSet(progress, benchPress.id)?.item.id).toBe(BENCH.id);
  });

  it('con el primer bloque lleno, al siguiente', () => {
    const sets = [setOf(benchPress.id), setOf(benchPress.id)];
    const progress = routineProgress([BENCH, SQUAT, BENCH_AGAIN], sets);

    expect(lineForNextSet(progress, benchPress.id)?.item.id).toBe(BENCH_AGAIN.id);
  });

  it('con todos los bloques llenos, al último', () => {
    const sets = [setOf(benchPress.id), setOf(benchPress.id), setOf(benchPress.id)];
    const progress = routineProgress([BENCH, SQUAT, BENCH_AGAIN], sets);

    expect(lineForNextSet(progress, benchPress.id)?.item.id).toBe(BENCH_AGAIN.id);
  });

  it('un ejercicio fuera de la rutina no tiene línea', () => {
    expect(lineForNextSet(routineProgress([BENCH], []), customCurl.id)).toBeNull();
  });
});

describe('describeNextSet', () => {
  it('dice el rango y qué serie va', () => {
    const progress = routineProgress([BENCH], [setOf(benchPress.id)]);
    const line = progress.lines[0];
    if (line === undefined) throw new Error('La rutina tiene una línea');

    expect(describeNextSet(line)).toBe('Rutina: 8–12 reps · serie 2 de 2');
  });

  it('con un número fijo de repeticiones y el bloque ya hecho', () => {
    const fixed = { ...BENCH, targetRepsMin: 5, targetRepsMax: 5 };
    const progress = routineProgress([fixed], [setOf(benchPress.id), setOf(benchPress.id)]);
    const line = progress.lines[0];
    if (line === undefined) throw new Error('La rutina tiene una línea');

    expect(describeNextSet(line)).toBe('Rutina: 5 reps · ya llevas las 2 series');
  });
});
