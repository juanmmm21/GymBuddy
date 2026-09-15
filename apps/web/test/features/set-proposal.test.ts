import type { StrengthSetEntry } from '@gymbuddy/shared';
import { describe, expect, it } from 'vitest';
import { describeProposal, proposeSet } from '../../src/features/session/set-proposal';
import { benchPress, customCurl, squat } from '../fixtures';

function set(overrides: Partial<StrengthSetEntry>): StrengthSetEntry {
  return {
    id: crypto.randomUUID(),
    trackedExerciseId: benchPress.id,
    kind: 'strength',
    orderIndex: 0,
    weight: '70.00',
    reps: 10,
    rpe: null,
    isWarmup: false,
    completedAt: '2026-09-14T18:00:00.000Z',
    ...overrides,
  };
}

describe('proposeSet', () => {
  it('sin series hoy propone la última serie de la última vez, no el peso habitual', () => {
    const proposal = proposeSet(benchPress, []);

    expect(proposal.source).toBe('last_time');
    // La fixture tiene peso habitual 82,5 kg y última serie 80 kg × 6.
    expect(proposal.values).toEqual({ weightGrams: 80_000, reps: 6, rpe: null, isWarmup: false });
  });

  it('con series hoy manda la última de la sesión, por hora y sin calentamiento', () => {
    const sets = [
      set({ weight: '85.00', reps: 5, completedAt: '2026-09-14T18:10:00.000Z' }),
      set({ weight: '60.00', reps: 12, isWarmup: true, completedAt: '2026-09-14T18:20:00.000Z' }),
      set({ weight: '82.50', reps: 6, completedAt: '2026-09-14T18:05:00.000Z' }),
      set({
        kind: 'strength',
        trackedExerciseId: squat.id,
        weight: '120.00',
        completedAt: '2026-09-14T18:30:00.000Z',
      }),
    ];

    const proposal = proposeSet(benchPress, sets);

    expect(proposal.source).toBe('session');
    expect(proposal.values).toMatchObject({ weightGrams: 85_000, reps: 5 });
  });

  it('un ejercicio sin ninguna serie no propone nada', () => {
    const proposal = proposeSet(customCurl, []);

    expect(proposal.source).toBe('none');
    expect(proposal.values).toMatchObject({ weightGrams: null, reps: null });
    expect(describeProposal('none')).toMatch(/primera serie/);
  });
});
