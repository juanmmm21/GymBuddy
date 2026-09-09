import type { PersonalRecord } from '@gymbuddy/shared';
import { describe, expect, it } from 'vitest';
import { markValue, progressionMarks } from '../../src/features/exercises/progression-marks';
import { benchPress, benchPressPoints, benchPressStats } from '../fixtures';

const [, second, , latest] = benchPressPoints;

/** Una marca con la hora de la serie que la consiguió, que es como llega del contrato. */
function record(overrides: Partial<PersonalRecord>): PersonalRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    trackedExerciseId: benchPress.id,
    kind: 'max_weight',
    value: '85.00',
    setEntryId: '22222222-2222-4222-8222-222222222222',
    achievedAt: '2026-09-06T18:20:00.000Z',
    ...overrides,
  };
}

describe('progressionMarks', () => {
  it('reparte cada marca en la línea que le corresponde', () => {
    const marks = progressionMarks(benchPressPoints, benchPressStats.records);

    expect(marks.map((mark) => mark.series)).toEqual(['weight', 'oneRepMax']);
    expect(marks[0]?.point).toBe(latest);
    expect(marks[1]?.point).toBe(second);
  });

  it('la marca cae en la sesión que estaba abierta cuando se consiguió', () => {
    const middle = record({ achievedAt: '2026-08-30T19:45:00.000Z' });

    expect(progressionMarks(benchPressPoints, [middle])[0]?.point).toBe(second);
  });

  it('el volumen no cabe en la escala de la gráfica y no se pinta', () => {
    const volume = record({ kind: 'max_volume', value: '1980.00' });

    expect(progressionMarks(benchPressPoints, [volume])).toEqual([]);
  });

  it('una marca anterior a las sesiones que hay no se pinta en la primera', () => {
    const ancient = record({ achievedAt: '2026-01-01T10:00:00.000Z' });

    expect(progressionMarks(benchPressPoints, [ancient])).toEqual([]);
  });

  it('una fecha ilegible se descarta en vez de propagar un NaN a las coordenadas', () => {
    const broken = record({ achievedAt: 'nunca' });

    expect(progressionMarks(benchPressPoints, [broken])).toEqual([]);
  });

  it('sin puntos no hay dónde poner las marcas', () => {
    expect(progressionMarks([], benchPressStats.records)).toEqual([]);
  });
});

describe('markValue', () => {
  it('toma el valor de la línea sobre la que cae la marca, no el del récord', () => {
    const marks = progressionMarks(benchPressPoints, benchPressStats.records);

    expect(marks.map((mark) => markValue(mark))).toEqual([
      latest?.topWeight,
      second?.estimatedOneRepMax,
    ]);
  });
});
