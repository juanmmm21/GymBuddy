import { describe, expect, it } from 'vitest';
import { MAX_RIVALS, exerciseDuels, type ExerciseBest } from '../src/domain/competition';
import { competitionSchema, setRivalsRequestSchema } from '../src/schemas/competition';
import { userSchema } from '../src/schemas/user';

const JUAN = '3f6c2b1a-58e6-4c65-9d0e-2b1a4c7f8d31';
const ANA = '7a1d9c3e-2b4f-4a6d-8e0f-1c2d3e4f5a6b';
const LEO = '9b8c7d6e-5f4a-4b3c-9d2e-1f0a9b8c7d6e';

const best = (userId: string, catalogId: string, maxWeightGrams: number): ExerciseBest => ({
  userId,
  catalogId,
  maxWeightGrams,
});

describe('exerciseDuels', () => {
  it('solo compara los ejercicios que quien mira comparte con algún rival', () => {
    const duels = exerciseDuels(
      [
        best(JUAN, 'pectorals/bench', 100_000),
        best(ANA, 'pectorals/bench', 60_000),
        // Solo de Juan: no hay con quién comparar.
        best(JUAN, 'quads/squat', 140_000),
        // De dos rivales pero no de Juan: no es su competición.
        best(ANA, 'lats/pull-up', 10_000),
        best(LEO, 'lats/pull-up', 20_000),
      ],
      JUAN,
    );

    expect(duels.map((duel) => duel.catalogId)).toEqual(['pectorals/bench']);
  });

  it('ordena del más pesado al más ligero, y los empatados conservan el orden', () => {
    const [duel] = exerciseDuels(
      [
        best(JUAN, 'pectorals/bench', 100_000),
        best(ANA, 'pectorals/bench', 102_500),
        best(LEO, 'pectorals/bench', 100_000),
      ],
      JUAN,
    );

    expect(duel?.entries.map((entry) => entry.userId)).toEqual([ANA, JUAN, LEO]);
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

  it('un cara a cara necesita al menos dos marcas', () => {
    const exercise = {
      catalogId: 'pectorals/bench',
      name: 'Press de banca',
      gifUrl: 'https://cdn.example.test/bench.gif',
      entries: [{ userId: JUAN, displayName: 'Juan', isSelf: true, maxWeight: '100.00' }],
    };

    expect(
      competitionSchema.safeParse({
        generatedAt: '2026-10-14T18:00:00.000Z',
        rivals: [{ userId: ANA, displayName: 'Ana' }],
        exercises: [exercise],
      }).success,
    ).toBe(false);
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
