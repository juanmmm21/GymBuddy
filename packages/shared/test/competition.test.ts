import { describe, expect, it } from 'vitest';
import {
  MAX_RIVALS,
  exerciseDuels,
  rankWeekTotals,
  weekTotals,
  type ExerciseBest,
  type WeekTotals,
} from '../src/domain/competition';
import type { WeekDaySummary } from '../src/domain/week';
import { competitionSchema, setRivalsRequestSchema } from '../src/schemas/competition';
import { userSchema } from '../src/schemas/user';

const JUAN = '3f6c2b1a-58e6-4c65-9d0e-2b1a4c7f8d31';
const ANA = '7a1d9c3e-2b4f-4a6d-8e0f-1c2d3e4f5a6b';
const LEO = '9b8c7d6e-5f4a-4b3c-9d2e-1f0a9b8c7d6e';

const day = (
  dayIndex: number,
  trained: boolean,
  setCount: number,
  volumeGrams: number,
): WeekDaySummary => ({
  dayIndex,
  date: `2026-10-${String(12 + dayIndex)}`,
  trained,
  bodyParts: [],
  volumeGrams,
  setCount,
});

const totals = (
  userId: string,
  daysTrained: number,
  setCount: number,
  volumeGrams: number,
): WeekTotals & { userId: string } => ({ userId, daysTrained, setCount, volumeGrams });

const best = (
  userId: string,
  catalogId: string,
  maxWeightGrams: number,
  estimatedOneRepMaxGrams: number,
): ExerciseBest => ({ userId, catalogId, maxWeightGrams, estimatedOneRepMaxGrams });

describe('weekTotals', () => {
  it('suma días entrenados, series y volumen', () => {
    expect(
      weekTotals([day(0, true, 12, 3_000_000), day(1, false, 0, 0), day(2, true, 9, 1_500_000)]),
    ).toEqual({ daysTrained: 2, setCount: 21, volumeGrams: 4_500_000 });
  });

  it('un día de solo calentamiento cuenta como entrenado aunque no sume series', () => {
    expect(weekTotals([day(0, true, 0, 0)])).toEqual({
      daysTrained: 1,
      setCount: 0,
      volumeGrams: 0,
    });
  });
});

describe('rankWeekTotals', () => {
  it('mandan los días; después las series y solo al final el volumen', () => {
    const ranked = rankWeekTotals([
      totals(JUAN, 2, 40, 9_000_000),
      totals(ANA, 3, 10, 1_000_000),
      totals(LEO, 2, 40, 9_500_000),
    ]);

    expect(ranked.map((entry) => [entry.userId, entry.rank])).toEqual([
      [ANA, 1],
      [LEO, 2],
      [JUAN, 3],
    ]);
  });

  it('quien empata en todo comparte puesto, el siguiente se lo salta y el orden de entrada se conserva', () => {
    const ranked = rankWeekTotals([
      totals(JUAN, 1, 5, 100),
      totals(ANA, 0, 0, 0),
      totals(LEO, 1, 5, 100),
    ]);

    expect(ranked.map((entry) => [entry.userId, entry.rank])).toEqual([
      [JUAN, 1],
      [LEO, 1],
      [ANA, 3],
    ]);
  });
});

describe('exerciseDuels', () => {
  it('solo compara los ejercicios que quien mira comparte con algún rival', () => {
    const duels = exerciseDuels(
      [
        best(JUAN, 'pectorals/bench', 100_000, 112_000),
        best(ANA, 'pectorals/bench', 60_000, 70_000),
        // Solo de Juan: no hay con quién comparar.
        best(JUAN, 'quads/squat', 140_000, 150_000),
        // De dos rivales pero no de Juan: no es su competición.
        best(ANA, 'lats/pull-up', 10_000, 12_000),
        best(LEO, 'lats/pull-up', 20_000, 22_000),
      ],
      JUAN,
    );

    expect(duels.map((duel) => duel.catalogId)).toEqual(['pectorals/bench']);
  });

  it('ordena por 1RM estimado y desempata con el peso máximo', () => {
    const [duel] = exerciseDuels(
      [
        best(JUAN, 'pectorals/bench', 100_000, 105_000),
        // Menos peso en la barra, pero más repeticiones: va por delante.
        best(ANA, 'pectorals/bench', 90_000, 114_000),
        best(LEO, 'pectorals/bench', 102_500, 105_000),
      ],
      JUAN,
    );

    expect(duel?.entries.map((entry) => entry.userId)).toEqual([ANA, LEO, JUAN]);
  });
});

describe('contrato de la competición', () => {
  it('la lista de rivales no admite repetidos ni pasar del tope', () => {
    expect(setRivalsRequestSchema.safeParse({ rivalIds: [ANA, ANA] }).success).toBe(false);
    expect(
      setRivalsRequestSchema.safeParse({
        rivalIds: Array.from({ length: MAX_RIVALS + 1 }, () => crypto.randomUUID()),
      }).success,
    ).toBe(false);
    expect(setRivalsRequestSchema.parse({ rivalIds: [] })).toEqual({ rivalIds: [] });
  });

  it('la clasificación siempre trae al menos a quien mira', () => {
    const base = {
      generatedAt: '2026-10-13T18:00:00.000Z',
      weekStart: '2026-10-12',
      exercises: [],
    };

    expect(competitionSchema.safeParse({ ...base, week: [] }).success).toBe(false);
    expect(
      competitionSchema.safeParse({
        ...base,
        week: [
          {
            userId: JUAN,
            displayName: 'Juan',
            isSelf: true,
            rank: 1,
            daysTrained: 2,
            setCount: 21,
            volume: '4500.00',
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('una sesión guardada antes de que existiera «competir» se lee como que no compite', () => {
    const stored = {
      id: JUAN,
      displayName: 'Juan',
      locale: 'es',
      unitSystem: 'metric',
      createdAt: '2026-09-12T10:00:00.000Z',
    };

    expect(userSchema.parse(stored).competes).toBe(false);
  });
});
