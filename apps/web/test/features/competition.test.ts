import { MAX_RIVALS, type Competition, type RivalCandidate } from '@gymbuddy/shared';
import { describe, expect, it } from 'vitest';
import {
  barPercents,
  boardAgainst,
  canToggleRival,
  rivalsChanged,
  selectedRivalIds,
  toggleRival,
} from '../../src/features/competition/standings';

const JUAN = '3f6c2b1a-58e6-4c65-9d0e-2b1a4c7f8d31';
const ANA = '7a1d9c3e-2b4f-4a6d-8e0f-1c2d3e4f5a6b';
const LEO = '9b8c7d6e-5f4a-4b3c-9d2e-1f0a9b8c7d6e';

const candidate = (userId: string, selected: boolean): RivalCandidate => ({
  userId,
  displayName: userId === ANA ? 'Ana' : 'Leo',
  competes: true,
  selected,
});

const entry = (userId: string, maxWeight: string) => ({
  userId,
  displayName: userId === JUAN ? 'Juan' : userId === ANA ? 'Ana' : 'Leo',
  isSelf: userId === JUAN,
  maxWeight,
});

const exercise = (name: string, entries: ReturnType<typeof entry>[]) => ({
  catalogId: `x/${name}`,
  name,
  gifUrl: `https://cdn.example.test/${name}.gif`,
  entries,
});

const competition: Competition = {
  generatedAt: '2026-10-14T18:00:00.000Z',
  rivals: [
    { userId: ANA, displayName: 'Ana' },
    { userId: LEO, displayName: 'Leo' },
  ],
  exercises: [
    exercise('Peso muerto', [entry(JUAN, '160.00'), entry(ANA, '135.00')]),
    exercise('Press de banca', [entry(LEO, '110.00'), entry(JUAN, '100.00'), entry(ANA, '95.00')]),
    exercise('Remo con barra', [entry(JUAN, '80.00'), entry(ANA, '80.00')]),
    exercise('Sentadilla', [entry(ANA, '150.00'), entry(JUAN, '140.00')]),
  ],
};

describe('el marcador contra un rival', () => {
  it('cuenta un punto por ejercicio compartido, de dos en dos', () => {
    const ana = boardAgainst(competition, { userId: ANA, displayName: 'Ana' });
    // Leo gana el press a los dos, pero contra Ana ese punto sigue siendo de Juan.
    expect([ana.wins, ana.losses, ana.draws]).toEqual([2, 1, 1]);

    const leo = boardAgainst(competition, { userId: LEO, displayName: 'Leo' });
    expect([leo.wins, leo.losses, leo.draws]).toEqual([0, 1, 0]);
    expect(leo.duels.map((duel) => duel.name)).toEqual(['Press de banca']);
  });

  it('pone primero lo que vas perdiendo, que es lo que hay que ir a buscar', () => {
    const ana = boardAgainst(competition, { userId: ANA, displayName: 'Ana' });

    expect(ana.duels.map((duel) => duel.name)).toEqual([
      'Sentadilla',
      'Remo con barra',
      'Press de banca',
      'Peso muerto',
    ]);
  });

  it('las barras van en proporción al más pesado', () => {
    expect(
      barPercents({
        catalogId: 'x',
        name: 'x',
        gifUrl: 'x',
        mineGrams: 150_000,
        theirsGrams: 75_000,
      }),
    ).toEqual({ mine: 100, theirs: 50 });
    expect(
      barPercents({ catalogId: 'x', name: 'x', gifUrl: 'x', mineGrams: 0, theirsGrams: 0 }),
    ).toEqual({ mine: 0, theirs: 0 });
  });
});

describe('elegir rivales', () => {
  it('arranca con los que ya estaban elegidos', () => {
    expect(selectedRivalIds([candidate(ANA, true), candidate(LEO, false)])).toEqual([ANA]);
  });

  it('pulsar a alguien le mete o le saca', () => {
    expect(toggleRival([ANA], LEO)).toEqual([ANA, LEO]);
    expect(toggleRival([ANA, LEO], ANA)).toEqual([LEO]);
  });

  it('con el tope alcanzado solo se puede quitar', () => {
    const full = Array.from({ length: MAX_RIVALS }, (_unused, index) => `rival-${String(index)}`);

    expect(canToggleRival(full, LEO)).toBe(false);
    expect(canToggleRival(full, 'rival-0')).toBe(true);
    expect(canToggleRival(full.slice(1), LEO)).toBe(true);
  });

  it('solo hay algo que guardar si la elección cambia, sin importar el orden', () => {
    const candidates = [candidate(ANA, true), candidate(LEO, true)];

    expect(rivalsChanged(candidates, [LEO, ANA])).toBe(false);
    expect(rivalsChanged(candidates, [ANA])).toBe(true);
    expect(rivalsChanged([candidate(ANA, false)], [ANA])).toBe(true);
  });
});
