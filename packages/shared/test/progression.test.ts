import { describe, expect, it } from 'vitest';
import {
  bestEstimatedOneRepMaxGrams,
  effectiveSets,
  estimateOneRepMaxGrams,
  heaviestSet,
  progressionPoints,
  sessionVolumeGrams,
  setVolumeGrams,
  summarizeWorkingWeight,
  toProgressionSet,
  topSetsBySession,
  workingWeightGrams,
  type ProgressionSession,
  type ProgressionSet,
  type SessionTopSet,
} from '../src/domain/progression';

const set = (
  weightGrams: number,
  reps: number,
  completedAt = '2026-08-24T18:00:00.000Z',
  isWarmup = false,
): ProgressionSet => ({ weightGrams, reps, isWarmup, completedAt });

const top = (startedAt: string, weightGrams: number, reps = 8): SessionTopSet => ({
  sessionId: startedAt,
  startedAt,
  weightGrams,
  reps,
});

describe('toProgressionSet', () => {
  it('convierte el peso del contrato a gramos exactos', () => {
    expect(
      toProgressionSet({
        weight: '82.50',
        reps: 8,
        isWarmup: false,
        completedAt: '2026-08-24T18:00:00.000Z',
      }),
    ).toStrictEqual(set(82_500, 8));
  });
});

describe('effectiveSets y heaviestSet', () => {
  it('deja fuera el calentamiento', () => {
    const sets = [set(60_000, 12, '2026-08-24T18:00:00.000Z', true), set(80_000, 8)];

    expect(effectiveSets(sets)).toStrictEqual([set(80_000, 8)]);
    expect(heaviestSet(sets)?.weightGrams).toBe(80_000);
  });

  it('no hay serie más pesada si todo fue calentamiento', () => {
    expect(heaviestSet([set(60_000, 12, '2026-08-24T18:00:00.000Z', true)])).toBeNull();
  });

  it('rompe el empate de peso por repeticiones y luego por la más reciente', () => {
    const fewReps = set(82_500, 6, '2026-08-24T18:10:00.000Z');
    const moreReps = set(82_500, 8, '2026-08-24T18:20:00.000Z');

    expect(heaviestSet([moreReps, fewReps])).toStrictEqual(moreReps);
    expect(heaviestSet([set(82_500, 8, '2026-08-24T18:10:00.000Z'), moreReps])).toStrictEqual(
      moreReps,
    );
  });
});

describe('estimateOneRepMaxGrams', () => {
  it('aplica Epley en gramos enteros', () => {
    // 100 kg × 10 → 100 × (1 + 10/30) = 133.333… kg
    expect(estimateOneRepMaxGrams(100_000, 10)).toBe(133_333);
    expect(estimateOneRepMaxGrams(60_000, 30)).toBe(120_000);
  });

  it('redondea al alza en el empate exacto de medio gramo', () => {
    // 82.5 kg × 5 → 82500 × 35 / 30 = 96250 exacto: nada que redondear.
    expect(estimateOneRepMaxGrams(82_500, 5)).toBe(96_250);
    // 1 g × 15 → 45/30 = 1.5 → 2 g.
    expect(estimateOneRepMaxGrams(1, 15)).toBe(2);
    // 1 g × 14 → 44/30 = 1.466… → 1 g.
    expect(estimateOneRepMaxGrams(1, 14)).toBe(1);
  });

  it('con una sola repetición sigue la fórmula, sin excepciones', () => {
    expect(estimateOneRepMaxGrams(100_000, 1)).toBe(103_333);
  });

  it('rechaza entradas que no son enteros de gramos o repeticiones', () => {
    expect(() => estimateOneRepMaxGrams(82_500.5, 8)).toThrow(RangeError);
    expect(() => estimateOneRepMaxGrams(82_500, 0)).toThrow(RangeError);
    expect(() => estimateOneRepMaxGrams(-1, 8)).toThrow(RangeError);
  });
});

describe('volumen', () => {
  it('multiplica peso por repeticiones', () => {
    expect(setVolumeGrams(set(82_500, 8))).toBe(660_000);
  });

  it('suma la sesión sin contar el calentamiento', () => {
    const sets = [
      set(60_000, 10, '2026-08-24T18:00:00.000Z', true),
      set(82_500, 8),
      set(82_500, 7),
    ];

    expect(sessionVolumeGrams(sets)).toBe(660_000 + 577_500);
  });

  it('una sesión de solo calentamiento no suma volumen', () => {
    expect(sessionVolumeGrams([set(60_000, 10, '2026-08-24T18:00:00.000Z', true)])).toBe(0);
  });
});

describe('bestEstimatedOneRepMaxGrams', () => {
  it('no tiene por qué salir de la serie más pesada', () => {
    // 80 × 8 estima 101.33 kg; 85 × 5 estima 99.17 kg.
    const sets = [set(80_000, 8), set(85_000, 5)];

    expect(heaviestSet(sets)?.weightGrams).toBe(85_000);
    expect(bestEstimatedOneRepMaxGrams(sets)).toBe(101_333);
  });

  it('sin series efectivas no hay estimación', () => {
    expect(bestEstimatedOneRepMaxGrams([])).toBeNull();
  });
});

describe('workingWeightGrams', () => {
  it('con una sola sesión el peso habitual es el de esa sesión', () => {
    expect(workingWeightGrams([top('2026-08-24T18:00:00.000Z', 80_000)])).toBe(80_000);
  });

  it('es la mediana y no la última: una sesión suelta no lo mueve', () => {
    const tops = [
      top('2026-08-24T18:00:00.000Z', 60_000),
      top('2026-08-17T18:00:00.000Z', 80_000),
      top('2026-08-10T18:00:00.000Z', 80_000),
    ];

    expect(workingWeightGrams(tops)).toBe(80_000);
  });

  it('con un número par de sesiones promedia las dos centrales redondeando al alza', () => {
    const tops = [top('2026-08-24T18:00:00.000Z', 82_500), top('2026-08-17T18:00:00.000Z', 80_000)];

    expect(workingWeightGrams(tops)).toBe(81_250);
    // 1 g y 2 g: la media exacta es 1.5 g y se redondea al alza.
    expect(
      workingWeightGrams([top('2026-08-24T18:00:00.000Z', 2), top('2026-08-17T18:00:00.000Z', 1)]),
    ).toBe(2);
  });

  it('solo mira las últimas cinco sesiones, ordenadas por fecha y no por el orden recibido', () => {
    const tops = [
      top('2026-07-01T18:00:00.000Z', 40_000),
      top('2026-08-24T18:00:00.000Z', 100_000),
      top('2026-08-17T18:00:00.000Z', 100_000),
      top('2026-08-10T18:00:00.000Z', 100_000),
      top('2026-08-03T18:00:00.000Z', 100_000),
      top('2026-07-27T18:00:00.000Z', 100_000),
    ];

    expect(workingWeightGrams(tops)).toBe(100_000);
  });

  it('sin sesiones no hay peso habitual', () => {
    expect(workingWeightGrams([])).toBeNull();
  });
});

describe('summarizeWorkingWeight', () => {
  it('acompaña la mediana con las repeticiones y la fecha de la última vez', () => {
    const tops = [
      top('2026-08-17T18:00:00.000Z', 80_000, 8),
      top('2026-08-24T18:00:00.000Z', 82_500, 6),
    ];

    expect(summarizeWorkingWeight(tops)).toStrictEqual({
      weightGrams: 81_250,
      reps: 6,
      lastPerformedAt: '2026-08-24T18:00:00.000Z',
      sessionCount: 2,
    });
  });

  it('sin sesiones no hay resumen', () => {
    expect(summarizeWorkingWeight([])).toBeNull();
  });
});

describe('topSetsBySession y progressionPoints', () => {
  const sessions: ProgressionSession[] = [
    {
      sessionId: 'antigua',
      startedAt: '2026-08-17T18:00:00.000Z',
      sets: [
        set(60_000, 10, '2026-08-17T18:05:00.000Z', true),
        set(80_000, 8, '2026-08-17T18:15:00.000Z'),
      ],
    },
    {
      sessionId: 'reciente',
      startedAt: '2026-08-24T18:00:00.000Z',
      sets: [
        set(82_500, 8, '2026-08-24T18:15:00.000Z'),
        set(82_500, 7, '2026-08-24T18:25:00.000Z'),
      ],
    },
    { sessionId: 'solo-calentamiento', startedAt: '2026-08-20T18:00:00.000Z', sets: [] },
  ];

  it('da la serie más pesada de cada sesión, de la más reciente a la más antigua', () => {
    expect(topSetsBySession(sessions).map((entry) => entry.sessionId)).toStrictEqual([
      'reciente',
      'antigua',
    ]);
  });

  it('pinta los puntos de la más antigua a la más reciente y sin sesiones vacías', () => {
    const points = progressionPoints(sessions);

    expect(points.map((point) => point.sessionId)).toStrictEqual(['antigua', 'reciente']);
    expect(points[1]).toStrictEqual({
      sessionId: 'reciente',
      startedAt: '2026-08-24T18:00:00.000Z',
      topWeightGrams: 82_500,
      topReps: 8,
      estimatedOneRepMaxGrams: 104_500,
      volumeGrams: 660_000 + 577_500,
      totalReps: 15,
      setCount: 2,
    });
  });
});
