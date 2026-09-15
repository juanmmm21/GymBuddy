import type { CardioSetEntry, SetEntry, StrengthSetEntry, TrackedExercise } from '@gymbuddy/shared';
import { describe, expect, it } from 'vitest';
import {
  describeCardioProposal,
  describeProposal,
  proposeCardioSet,
  proposeSet,
  setKindFor,
} from '../../src/features/session/set-proposal';
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

function cardioSet(overrides: Partial<CardioSetEntry>): CardioSetEntry {
  return {
    id: crypto.randomUUID(),
    trackedExerciseId: treadmill.id,
    kind: 'cardio',
    orderIndex: 0,
    durationSeconds: 900,
    distanceMeters: null,
    rpe: null,
    isWarmup: false,
    completedAt: '2026-09-14T18:00:00.000Z',
    ...overrides,
  };
}

const treadmill: TrackedExercise = {
  ...customCurl,
  id: '9c3a2d5a-4f6e-4a71-8bcd-2e3f4a5b6c7d',
  name: 'Cinta',
  bodyPart: 'cardio',
  lastCardioSet: {
    durationSeconds: 1_200,
    distanceMeters: 3_000,
    completedAt: '2026-09-10T19:00:00.000Z',
  },
};

describe('proposeCardioSet', () => {
  it('sin cardio hoy propone la duración y la distancia de la última vez', () => {
    const proposal = proposeCardioSet(treadmill, []);

    expect(proposal.source).toBe('last_time');
    expect(proposal.values).toEqual({
      durationSeconds: 1_200,
      distanceMeters: 3_000,
      rpe: null,
      isWarmup: false,
    });
  });

  it('con cardio hoy manda el último de la sesión sin calentamiento, y la fuerza no cuenta', () => {
    const sets: SetEntry[] = [
      cardioSet({ durationSeconds: 600, completedAt: '2026-09-14T18:00:00.000Z' }),
      cardioSet({ durationSeconds: 300, isWarmup: true, completedAt: '2026-09-14T18:30:00.000Z' }),
      set({ trackedExerciseId: treadmill.id, completedAt: '2026-09-14T18:40:00.000Z' }),
    ];

    const proposal = proposeCardioSet(treadmill, sets);

    expect(proposal.source).toBe('session');
    expect(proposal.values).toMatchObject({ durationSeconds: 600, distanceMeters: null });
  });

  it('un ejercicio sin cardio no propone nada, y la fuerza ignora el cardio', () => {
    expect(proposeCardioSet(customCurl, []).source).toBe('none');
    expect(proposeCardioSet(customCurl, []).values.durationSeconds).toBeNull();
    expect(describeCardioProposal('none')).toMatch(/25:30/);

    const proposal = proposeSet(customCurl, [cardioSet({ trackedExerciseId: customCurl.id })]);
    expect(proposal.source).toBe('none');
  });
});

describe('setKindFor', () => {
  it('un ejercicio de la parte cardio registra cardio, aunque hoy se apuntara fuerza en él', () => {
    expect(setKindFor(treadmill)).toBe('cardio');
  });

  it('cualquier otro registra fuerza, aunque su última serie fuera de cardio', () => {
    const cardioLastTime: TrackedExercise = {
      ...customCurl,
      lastCardioSet: {
        durationSeconds: 600,
        distanceMeters: null,
        completedAt: '2026-09-02T18:00:00.000Z',
      },
    };

    expect(setKindFor(cardioLastTime)).toBe('strength');
    expect(setKindFor(benchPress)).toBe('strength');
    expect(setKindFor({ ...customCurl, bodyPart: null })).toBe('strength');
  });
});
