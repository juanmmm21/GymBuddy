import { pendingWriteSchema, type SessionWrite } from '../../src/offline/pending-write';
import type { CardioSetEntry, StrengthSetEntry } from '@gymbuddy/shared';
import { describe, expect, it } from 'vitest';
import { summarizeLiveSession } from '../../src/features/home/live-session';
import { proposeSet } from '../../src/features/session/set-proposal';
import { summarizeSession } from '../../src/features/session/summary';
import {
  formatCardioDuration,
  formatDistanceLabel,
  formatSetValueLabel,
} from '../../src/lib/format';
import { applyPendingWrites } from '../../src/offline/overlay';
import { activeSession, benchPress, squat, user } from '../fixtures';

const CARDIO_ID = '6f5e4d3c-2b1a-4c9d-8e7f-6a5b4c3d2e1f';

function strengthSet(overrides: Partial<StrengthSetEntry> = {}): StrengthSetEntry {
  return {
    id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    kind: 'strength',
    trackedExerciseId: benchPress.id,
    orderIndex: 0,
    weight: '80.00',
    reps: 8,
    rpe: null,
    isWarmup: false,
    completedAt: '2026-09-15T18:00:00.000Z',
    ...overrides,
  };
}

function cardioSet(overrides: Partial<CardioSetEntry> = {}): CardioSetEntry {
  return {
    id: CARDIO_ID,
    kind: 'cardio',
    trackedExerciseId: squat.id,
    orderIndex: 1,
    durationSeconds: 1_800,
    distanceMeters: 5_000,
    rpe: null,
    isWarmup: false,
    completedAt: '2026-09-15T18:40:00.000Z',
    ...overrides,
  };
}

describe('formatCardioDuration', () => {
  it('dice horas, minutos y segundos solo cuando los hay', () => {
    expect(formatCardioDuration(1_800)).toBe('30 min');
    expect(formatCardioDuration(45)).toBe('45 s');
    expect(formatCardioDuration(750)).toBe('12 min 30 s');
    expect(formatCardioDuration(3_900)).toBe('1 h 5 min');
    expect(formatCardioDuration(3_600)).toBe('1 h');
    expect(formatCardioDuration(0)).toBe('0 s');
  });
});

describe('formatDistanceLabel', () => {
  it('en metros por debajo del kilómetro y en kilómetros con dos decimales como mucho', () => {
    expect(formatDistanceLabel(800, 'es')).toBe('800 m');
    expect(formatDistanceLabel(5_000, 'es')).toBe('5 km');
    expect(formatDistanceLabel(5_200, 'es')).toBe('5,2 km');
    expect(formatDistanceLabel(5_250, 'en')).toBe('5.25 km');
    // 10 004 m son 10,00 km: el redondeo a centésimas no deja un "10,0".
    expect(formatDistanceLabel(10_004, 'es')).toBe('10 km');
    expect(formatDistanceLabel(10_995, 'es')).toBe('11 km');
  });
});

describe('formatSetValueLabel', () => {
  it('lee una de fuerza en kilos por repeticiones y una de cardio en tiempo y distancia', () => {
    expect(formatSetValueLabel(strengthSet({ weight: '82.50' }), 'es', false)).toBe('82,5 kg × 8');
    expect(formatSetValueLabel(cardioSet(), 'es', false)).toBe('30 min · 5 km');
    expect(formatSetValueLabel(cardioSet({ distanceMeters: null }), 'es', false)).toBe('30 min');
  });

  it('dice «por brazo» en una de fuerza a un brazo, y nada en una de cardio', () => {
    expect(formatSetValueLabel(strengthSet({ weight: '20.00', reps: 10 }), 'es', true)).toBe(
      '20 kg por brazo × 10',
    );
    expect(formatSetValueLabel(cardioSet(), 'es', true)).toBe('30 min · 5 km');
  });
});

describe('el cardio en los resúmenes de la sesión', () => {
  it('cuenta como serie y como ejercicio, pero no suma volumen', () => {
    const totals = summarizeSession([strengthSet(), cardioSet()], []);

    expect(totals).toEqual({
      setCount: 2,
      workingSetCount: 2,
      exerciseCount: 2,
      volumeGrams: 80_000 * 8,
    });
  });

  it('en Hoy, la última serie puede ser de cardio y se entrega tal cual', () => {
    const summary = summarizeLiveSession({ ...activeSession, sets: [strengthSet(), cardioSet()] }, [
      benchPress,
      squat,
    ]);

    expect(summary.lastSet).toEqual({
      exerciseName: squat.name,
      equipment: squat.equipment,
      unilateral: false,
      set: cardioSet(),
    });
  });

  it('proponer el peso salta el cardio del mismo ejercicio: no tiene kilos que proponer', () => {
    const later = cardioSet({ trackedExerciseId: benchPress.id });

    const proposal = proposeSet(benchPress, [strengthSet({ weight: '70.00', reps: 10 }), later]);

    expect(proposal.source).toBe('session');
    expect(proposal.values).toMatchObject({ weightGrams: 70_000, reps: 10 });
  });
});

describe('el cardio en la cola offline', () => {
  it('una escritura encolada antes del cardio, sin tipo, se lee como serie de fuerza', () => {
    const stored = {
      sequence: 0,
      userId: user.id,
      queuedAt: '2026-09-08T18:30:00.000Z',
      write: {
        kind: 'log_set',
        sessionId: activeSession.id,
        body: {
          id: CARDIO_ID,
          trackedExerciseId: squat.id,
          weight: '100.00',
          reps: 5,
          completedAt: '2026-09-08T18:30:00.000Z',
        },
      },
    };

    const parsed = pendingWriteSchema.parse(stored);

    expect(parsed.write).toMatchObject({ kind: 'log_set', body: { kind: 'strength' } });
  });

  it('una serie de cardio encolada exige su hora, como las de fuerza', () => {
    const write = {
      kind: 'log_set',
      sessionId: activeSession.id,
      body: { id: CARDIO_ID, kind: 'cardio', trackedExerciseId: squat.id, durationSeconds: 600 },
    };

    expect(
      pendingWriteSchema.safeParse({
        sequence: 0,
        userId: user.id,
        queuedAt: '2026-09-08T18:30:00.000Z',
        write,
      }).success,
    ).toBe(false);
  });

  it('una serie de cardio encolada se pinta con su duración, y su corrección con lo nuevo', () => {
    const writes: SessionWrite[] = [
      {
        kind: 'log_set',
        sessionId: activeSession.id,
        body: {
          id: CARDIO_ID,
          kind: 'cardio',
          trackedExerciseId: squat.id,
          durationSeconds: 600,
          distanceMeters: 1_500,
          completedAt: '2026-09-08T18:30:00.000Z',
        },
      },
      {
        kind: 'update_set',
        sessionId: activeSession.id,
        setId: CARDIO_ID,
        body: { durationSeconds: 900, distanceMeters: null },
      },
    ];

    const { session, pendingSetIds } = applyPendingWrites(activeSession, writes);

    expect(session?.sets.at(-1)).toMatchObject({
      id: CARDIO_ID,
      kind: 'cardio',
      durationSeconds: 900,
      distanceMeters: null,
      rpe: null,
      isWarmup: false,
    });
    expect(pendingSetIds.has(CARDIO_ID)).toBe(true);
  });
});
