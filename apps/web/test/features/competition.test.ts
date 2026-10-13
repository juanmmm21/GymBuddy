import { MAX_RIVALS, type CompetitionWeekStanding, type RivalCandidate } from '@gymbuddy/shared';
import { describe, expect, it } from 'vitest';
import {
  canToggleRival,
  rankLabel,
  rivalsChanged,
  selectedRivalIds,
  standingSummary,
  toggleRival,
} from '../../src/features/competition/standings';

const ANA = '7a1d9c3e-2b4f-4a6d-8e0f-1c2d3e4f5a6b';
const LEO = '9b8c7d6e-5f4a-4b3c-9d2e-1f0a9b8c7d6e';

const standing = (overrides: Partial<CompetitionWeekStanding> = {}): CompetitionWeekStanding => ({
  userId: ANA,
  displayName: 'Ana',
  isSelf: false,
  rank: 1,
  daysTrained: 3,
  setCount: 21,
  volume: '4500.50',
  ...overrides,
});

const candidate = (userId: string, selected: boolean): RivalCandidate => ({
  userId,
  displayName: userId === ANA ? 'Ana' : 'Leo',
  competes: true,
  selected,
});

describe('lo que lleva alguien en la semana', () => {
  it('se lee en el orden en que se clasifica: días, series y kilos', () => {
    expect(standingSummary(standing(), 'es')).toBe('3 días · 21 series · 4500,5 kg');
  });

  it('en singular cuando toca', () => {
    expect(standingSummary(standing({ daysTrained: 1, setCount: 1, volume: '80.00' }), 'es')).toBe(
      '1 día · 1 serie · 80 kg',
    );
  });

  it('quien no ha entrenado no enseña tres ceros', () => {
    expect(standingSummary(standing({ daysTrained: 0, setCount: 0, volume: '0.00' }), 'es')).toBe(
      'Sin entrenar esta semana',
    );
  });

  it('el puesto se dice entero', () => {
    expect(rankLabel(2, 3)).toBe('Puesto 2 de 3');
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
