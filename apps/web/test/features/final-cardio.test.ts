import type { CardioSetEntry, SetEntry, StrengthSetEntry, TrackedExercise } from '@gymbuddy/shared';
import { describe, expect, it } from 'vitest';
import { finalCardioOffer } from '../../src/features/session/final-cardio';
import { benchPress, customCurl, squat } from '../fixtures';

const treadmill: TrackedExercise = {
  ...customCurl,
  id: '9c3a2d5a-4f6e-4a71-8bcd-2e3f4a5b6c7d',
  name: 'Cinta',
  bodyPart: 'cardio',
};

const bike: TrackedExercise = {
  ...customCurl,
  id: '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a',
  name: 'Bici',
  bodyPart: 'cardio',
};

function strength(overrides: Partial<StrengthSetEntry> = {}): StrengthSetEntry {
  return {
    id: crypto.randomUUID(),
    trackedExerciseId: benchPress.id,
    kind: 'strength',
    orderIndex: 0,
    weight: '70.00',
    reps: 10,
    rpe: null,
    isWarmup: false,
    completedAt: '2026-09-15T18:00:00.000Z',
    ...overrides,
  };
}

function cardio(overrides: Partial<CardioSetEntry> = {}): CardioSetEntry {
  return {
    id: crypto.randomUUID(),
    trackedExerciseId: treadmill.id,
    kind: 'cardio',
    orderIndex: 0,
    durationSeconds: 600,
    distanceMeters: null,
    rpe: null,
    isWarmup: false,
    completedAt: '2026-09-15T17:30:00.000Z',
    ...overrides,
  };
}

function lastCardioAt(exercise: TrackedExercise, completedAt: string): TrackedExercise {
  return {
    ...exercise,
    lastCardioSet: { durationSeconds: 900, distanceMeters: null, completedAt },
  };
}

describe('finalCardioOffer', () => {
  it('no se ofrece en una sesión sin series', () => {
    expect(finalCardioOffer([benchPress, treadmill], [])).toEqual({ kind: 'none' });
  });

  it('no se ofrece si la sesión ya termina en cardio', () => {
    const sets: SetEntry[] = [strength(), cardio({ completedAt: '2026-09-15T18:20:00.000Z' })];

    expect(finalCardioOffer([benchPress, treadmill], sets)).toEqual({ kind: 'none' });
  });

  it('decide por hora y no por el orden de la lista: un cardio de antes sigue ofreciendo el final', () => {
    // El cardio va detrás en la lista (llegó tarde por la cola), pero se hizo antes que la fuerza.
    const sets: SetEntry[] = [strength(), cardio()];

    expect(finalCardioOffer([benchPress, treadmill], sets)).toEqual({
      kind: 'exercise',
      exerciseId: treadmill.id,
    });
  });

  it('propone el ejercicio del cardio de hoy antes que el de la última vez', () => {
    const sets: SetEntry[] = [cardio({ trackedExerciseId: bike.id }), strength()];
    const exercises = [benchPress, lastCardioAt(treadmill, '2026-09-14T19:00:00.000Z'), bike];

    expect(finalCardioOffer(exercises, sets)).toEqual({ kind: 'exercise', exerciseId: bike.id });
  });

  it('sin cardio hoy, propone el del cardio más reciente de la parte cardio', () => {
    const exercises = [
      benchPress,
      lastCardioAt(bike, '2026-09-10T19:00:00.000Z'),
      lastCardioAt(treadmill, '2026-09-12T19:00:00.000Z'),
    ];

    expect(finalCardioOffer(exercises, [strength()])).toEqual({
      kind: 'exercise',
      exerciseId: treadmill.id,
    });
  });

  it('un ejercicio de otra parte nunca se propone, aunque tenga cardio apuntado', () => {
    // Una serie de cardio vieja en una ficha de fuerza: desde que el tipo sale del ejercicio, ahí se registra fuerza.
    const ownTreadmill: TrackedExercise = { ...treadmill, id: squat.id, bodyPart: null };
    const sets: SetEntry[] = [cardio({ trackedExerciseId: ownTreadmill.id }), strength()];
    const exercises = [benchPress, lastCardioAt(ownTreadmill, '2026-09-12T19:00:00.000Z'), bike];

    expect(finalCardioOffer(exercises, sets)).toEqual({ kind: 'exercise', exerciseId: bike.id });
    expect(finalCardioOffer([benchPress, ownTreadmill], [strength()])).toEqual({
      kind: 'no_exercise',
    });
  });

  it('sin cardio registrado nunca, propone el primero de la parte cardio', () => {
    expect(finalCardioOffer([benchPress, bike, treadmill], [strength()])).toEqual({
      kind: 'exercise',
      exerciseId: bike.id,
    });
  });

  it('un cardio de hoy en un ejercicio que ya no se puede elegir no se propone', () => {
    const sets: SetEntry[] = [cardio({ trackedExerciseId: bike.id }), strength()];

    expect(finalCardioOffer([benchPress, treadmill], sets)).toEqual({
      kind: 'exercise',
      exerciseId: treadmill.id,
    });
  });

  it('sin ningún ejercicio de cardio lo dice, para mandar al catálogo', () => {
    expect(finalCardioOffer([benchPress, squat], [strength()])).toEqual({ kind: 'no_exercise' });
  });
});
