import { describe, expect, it } from 'vitest';
import {
  NO_PERSONAL_RECORDS,
  bestPersonalRecords,
  detectPersonalRecords,
  replayPersonalRecords,
  type PersonalRecordBests,
  type RecordReplaySet,
  type ReplayedRecord,
} from '../src/domain/records';
import type { ProgressionSet } from '../src/domain/progression';

const set = (weightGrams: number, reps: number, isWarmup = false): ProgressionSet => ({
  weightGrams,
  reps,
  isWarmup,
  completedAt: '2026-08-24T18:00:00.000Z',
});

const kinds = (bests: PersonalRecordBests, entry: ProgressionSet): string[] =>
  detectPersonalRecords(entry, bests).map((record) => record.kind);

describe('detectPersonalRecords', () => {
  it('la primera serie efectiva estrena las tres marcas', () => {
    expect(detectPersonalRecords(set(80_000, 8), NO_PERSONAL_RECORDS)).toStrictEqual([
      { kind: 'max_weight', valueGrams: 80_000 },
      { kind: 'estimated_1rm', valueGrams: 101_333 },
      { kind: 'max_volume', valueGrams: 640_000 },
    ]);
  });

  it('repetir exactamente la marca no es un récord', () => {
    const bests: PersonalRecordBests = {
      maxWeightGrams: 80_000,
      estimatedOneRepMaxGrams: 101_333,
      maxVolumeGrams: 640_000,
    };

    expect(detectPersonalRecords(set(80_000, 8), bests)).toStrictEqual([]);
  });

  it('rompe solo las marcas que supera', () => {
    const bests: PersonalRecordBests = {
      maxWeightGrams: 80_000,
      estimatedOneRepMaxGrams: 101_333,
      maxVolumeGrams: 640_000,
    };

    // 85 × 5: más peso, pero menos 1RM estimado (99.17 kg) y menos volumen.
    expect(kinds(bests, set(85_000, 5))).toStrictEqual(['max_weight']);
    // 80 × 9: mismo peso, mejor estimación y más volumen.
    expect(kinds(bests, set(80_000, 9))).toStrictEqual(['estimated_1rm', 'max_volume']);
  });

  it('una bajada de peso no rompe nada', () => {
    const bests: PersonalRecordBests = {
      maxWeightGrams: 100_000,
      estimatedOneRepMaxGrams: 133_333,
      maxVolumeGrams: 1_000_000,
    };

    expect(detectPersonalRecords(set(70_000, 5), bests)).toStrictEqual([]);
  });

  it('el calentamiento nunca marca récord, por pesado que sea', () => {
    expect(detectPersonalRecords(set(200_000, 10, true), NO_PERSONAL_RECORDS)).toStrictEqual([]);
  });

  it('una serie sin peso no marca récord: ahí el progreso son repeticiones', () => {
    expect(detectPersonalRecords(set(0, 30), NO_PERSONAL_RECORDS)).toStrictEqual([]);
  });

  it('una marca vigente suelta se respeta aunque falten las otras dos', () => {
    const bests: PersonalRecordBests = {
      maxWeightGrams: 90_000,
      estimatedOneRepMaxGrams: null,
      maxVolumeGrams: null,
    };

    expect(kinds(bests, set(85_000, 8))).toStrictEqual(['estimated_1rm', 'max_volume']);
  });
});

describe('replayPersonalRecords', () => {
  const replaySet = (
    id: string,
    completedAt: string,
    weightGrams: number,
    reps: number,
    options: { readonly orderIndex?: number; readonly isWarmup?: boolean } = {},
  ): RecordReplaySet => ({
    id,
    completedAt,
    weightGrams,
    reps,
    orderIndex: options.orderIndex ?? 0,
    isWarmup: options.isWarmup ?? false,
  });

  const maxWeights = (records: readonly ReplayedRecord[]): [string, number][] =>
    records
      .filter((record) => record.kind === 'max_weight')
      .map((record) => [record.setId, record.valueGrams]);

  it('la siguiente mejor serie hereda la marca de la que se borró', () => {
    // Quedan 100 kg el lunes y 110 kg el miércoles; los 120 kg del martes ya no están.
    const sets = [
      replaySet('lunes', '2026-08-24T18:00:00.000Z', 100_000, 5),
      replaySet('miercoles', '2026-08-26T18:00:00.000Z', 110_000, 5),
    ];

    const records = replayPersonalRecords(sets, {
      from: '2026-08-25T18:00:00.000Z',
      kept: { maxWeightGrams: 100_000, estimatedOneRepMaxGrams: 116_667, maxVolumeGrams: 500_000 },
    });

    expect(records).toStrictEqual([
      {
        kind: 'max_weight',
        valueGrams: 110_000,
        setId: 'miercoles',
        achievedAt: '2026-08-26T18:00:00.000Z',
      },
      {
        kind: 'estimated_1rm',
        valueGrams: 128_333,
        setId: 'miercoles',
        achievedAt: '2026-08-26T18:00:00.000Z',
      },
      {
        kind: 'max_volume',
        valueGrams: 550_000,
        setId: 'miercoles',
        achievedAt: '2026-08-26T18:00:00.000Z',
      },
    ]);
  });

  it('no reescribe nada de lo anterior a `from`', () => {
    const sets = [
      replaySet('antes', '2026-08-20T18:00:00.000Z', 90_000, 5),
      replaySet('despues', '2026-08-27T18:00:00.000Z', 80_000, 5),
    ];

    const records = replayPersonalRecords(sets, {
      from: '2026-08-25T00:00:00.000Z',
      kept: { maxWeightGrams: 90_000, estimatedOneRepMaxGrams: 105_000, maxVolumeGrams: 450_000 },
    });

    expect(records).toStrictEqual([]);
  });

  it('una marca conservada que no sale de las series sigue siendo el listón', () => {
    // La marca de 130 kg vino en una copia importada sin la serie que la respalde en este orden.
    const sets = [replaySet('despues', '2026-08-27T18:00:00.000Z', 120_000, 1)];

    const records = replayPersonalRecords(sets, {
      from: '2026-08-25T00:00:00.000Z',
      kept: { maxWeightGrams: 130_000, estimatedOneRepMaxGrams: null, maxVolumeGrams: null },
    });

    expect(records.map((record) => record.kind)).toStrictEqual(['estimated_1rm', 'max_volume']);
  });

  it('encadena las marcas en el orden en que se levantaron, no en el que llegan', () => {
    const sets = [
      replaySet('tercera', '2026-08-26T18:10:00.000Z', 105_000, 5),
      replaySet('primera', '2026-08-26T18:00:00.000Z', 100_000, 5),
      replaySet('segunda', '2026-08-26T18:05:00.000Z', 95_000, 5),
    ];

    const records = replayPersonalRecords(sets, {
      from: '2026-08-26T00:00:00.000Z',
      kept: NO_PERSONAL_RECORDS,
    });

    expect(maxWeights(records)).toStrictEqual([
      ['primera', 100_000],
      ['tercera', 105_000],
    ]);
  });

  it('compara instantes y no texto: el desfase horario no desordena', () => {
    // 20:00+02:00 son las 18:00 UTC, antes que las 18:30 UTC aunque como texto vaya después.
    const sets = [
      replaySet('utc', '2026-08-26T18:30:00.000Z', 100_000, 5),
      replaySet('madrid', '2026-08-26T20:00:00.000+02:00', 90_000, 5),
    ];

    const records = replayPersonalRecords(sets, {
      from: '2026-08-26T00:00:00.000Z',
      kept: NO_PERSONAL_RECORDS,
    });

    expect(maxWeights(records)).toStrictEqual([
      ['madrid', 90_000],
      ['utc', 100_000],
    ]);
  });

  it('en el mismo instante desempata la posición en la sesión', () => {
    const sets = [
      replaySet('b', '2026-08-26T18:00:00.000Z', 100_000, 5, { orderIndex: 1 }),
      replaySet('a', '2026-08-26T18:00:00.000Z', 100_000, 5, { orderIndex: 0 }),
    ];

    const records = replayPersonalRecords(sets, {
      from: '2026-08-26T00:00:00.000Z',
      kept: NO_PERSONAL_RECORDS,
    });

    // Repetir el mismo peso no es récord: se lo queda la primera que se hizo.
    expect(maxWeights(records)).toStrictEqual([['a', 100_000]]);
  });

  it('el calentamiento sigue sin marcar al reconstruir', () => {
    const sets = [
      replaySet('calentar', '2026-08-26T18:00:00.000Z', 60_000, 10, { isWarmup: true }),
    ];

    expect(
      replayPersonalRecords(sets, { from: '2026-08-26T00:00:00.000Z', kept: NO_PERSONAL_RECORDS }),
    ).toStrictEqual([]);
  });

  it('rechaza un instante ilegible en vez de ordenar a ciegas', () => {
    expect(() => replayPersonalRecords([], { from: 'ayer', kept: NO_PERSONAL_RECORDS })).toThrow(
      RangeError,
    );
  });
});

describe('bestPersonalRecords', () => {
  const bench = 'bench';
  const squat = 'squat';
  const record = (
    id: string,
    trackedExerciseId: string,
    kind: 'max_weight' | 'estimated_1rm' | 'max_volume',
    value: string,
  ) => ({ id, trackedExerciseId, kind, value });

  it('sin marcas no hay nada que enseñar', () => {
    expect(bestPersonalRecords([])).toStrictEqual([]);
  });

  it('de varias series seguidas del mismo ejercicio se queda con la más alta de cada tipo', () => {
    const records = [
      record('a1', bench, 'max_weight', '80.00'),
      record('a2', bench, 'estimated_1rm', '101.33'),
      record('a3', bench, 'max_volume', '640.00'),
      record('b1', bench, 'max_weight', '82.50'),
      record('b2', bench, 'estimated_1rm', '104.50'),
      record('c1', bench, 'max_volume', '700.00'),
    ];

    expect(bestPersonalRecords(records).map((entry) => entry.id)).toStrictEqual(['b1', 'b2', 'c1']);
  });

  it('compara cifras y no texto: 100 kg supera a 99,5', () => {
    const records = [
      record('high-text', bench, 'max_weight', '99.50'),
      record('high-number', bench, 'max_weight', '100.00'),
    ];

    expect(bestPersonalRecords(records).map((entry) => entry.id)).toStrictEqual(['high-number']);
  });

  it('una marca que llega después y es peor no quita la mejor', () => {
    const records = [
      record('best', bench, 'max_weight', '90.00'),
      record('worse', bench, 'max_weight', '85.00'),
    ];

    expect(bestPersonalRecords(records).map((entry) => entry.id)).toStrictEqual(['best']);
  });

  it('a igual valor gana la que llegó después', () => {
    const records = [
      record('first', bench, 'max_weight', '90.00'),
      record('corrected', bench, 'max_weight', '90.00'),
    ];

    expect(bestPersonalRecords(records).map((entry) => entry.id)).toStrictEqual(['corrected']);
  });

  it('agrupa por ejercicio en el orden de su primera marca, y dentro peso, 1RM y volumen', () => {
    const records = [
      record('bench-volume', bench, 'max_volume', '640.00'),
      record('squat-weight', squat, 'max_weight', '120.00'),
      record('bench-weight', bench, 'max_weight', '82.50'),
      record('squat-volume', squat, 'max_volume', '600.00'),
      record('bench-1rm', bench, 'estimated_1rm', '104.50'),
    ];

    expect(bestPersonalRecords(records).map((entry) => entry.id)).toStrictEqual([
      'bench-weight',
      'bench-1rm',
      'bench-volume',
      'squat-weight',
      'squat-volume',
    ]);
  });

  it('lee el ancho del volumen: una marca de más de 9999 kg no revienta', () => {
    const records = [
      record('small', bench, 'max_volume', '9999.00'),
      record('big', bench, 'max_volume', '12000.00'),
    ];

    expect(bestPersonalRecords(records).map((entry) => entry.id)).toStrictEqual(['big']);
  });
});
