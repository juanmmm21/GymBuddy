import { describe, expect, it } from 'vitest';
import {
  bodyPartSchema,
  createRoutineRequestSchema,
  createTrackedExerciseRequestSchema,
  logSetRequestSchema,
  muscleSchema,
  personalRecordSchema,
  setEntrySchema,
  trackedExerciseSchema,
  userSchema,
  workoutSessionDetailSchema,
} from '../src/schemas/index';

const EXERCISE_ID = '3f6c2b1a-58e6-4c65-9d0e-2b1a4c7f8d31';
const SESSION_ID = 'a0c14d2f-9b7e-4a11-8f3c-6d5e2a9b0c74';
const SET_ID = 'd41f7b90-3c22-4e58-9a6b-1f0c8e7d5a23';

describe('catálogo: muscle no es bodyPart', () => {
  it('no acepta un músculo donde va una parte del cuerpo', () => {
    expect(bodyPartSchema.safeParse('pectorals').success).toBe(false);
    expect(bodyPartSchema.safeParse('chest').success).toBe(true);
  });

  it('no acepta una parte del cuerpo donde va un músculo', () => {
    expect(muscleSchema.safeParse('chest').success).toBe(false);
    expect(muscleSchema.safeParse('pectorals').success).toBe(true);
  });

  it('cubre los diecinueve músculos y las siete partes del cuerpo del catálogo', () => {
    expect(muscleSchema.options).toHaveLength(19);
    expect(bodyPartSchema.options).toHaveLength(7);
  });
});

describe('series', () => {
  const validSet = {
    id: SET_ID,
    trackedExerciseId: EXERCISE_ID,
    orderIndex: 0,
    weight: '82.50',
    reps: 8,
    rpe: 8.5,
    isWarmup: false,
    completedAt: '2026-09-07T18:30:00.000Z',
    source: 'web',
  };

  it('acepta una serie completa', () => {
    expect(setEntrySchema.safeParse(validSet).success).toBe(true);
  });

  it('exige el peso en kilogramos con dos decimales', () => {
    for (const weight of ['82.5', '82', 82.5, '82.500', '-82.50']) {
      expect(setEntrySchema.safeParse({ ...validSet, weight }).success).toBe(false);
    }
  });

  it('rechaza repeticiones no positivas y un rpe fuera de paso', () => {
    expect(logSetRequestSchema.safeParse({ ...validSet, reps: 0 }).success).toBe(false);
    expect(logSetRequestSchema.safeParse({ ...validSet, rpe: 8.3 }).success).toBe(false);
    expect(logSetRequestSchema.safeParse({ ...validSet, rpe: 8.5 }).success).toBe(true);
  });

  it('deja el rpe y el momento fuera de lo obligatorio al registrar', () => {
    const parsed = logSetRequestSchema.safeParse({
      trackedExerciseId: EXERCISE_ID,
      weight: '60.00',
      reps: 10,
      source: 'bot',
    });

    expect(parsed.success).toBe(true);
  });
});

describe('sesión', () => {
  it('acepta una sesión abierta sin fin y con sus series', () => {
    const parsed = workoutSessionDetailSchema.safeParse({
      id: SESSION_ID,
      startedAt: '2026-09-07T18:00:00.000Z',
      endedAt: null,
      notes: null,
      source: 'web',
      sets: [],
    });

    expect(parsed.success).toBe(true);
  });
});

describe('ejercicio seguido', () => {
  it('distingue el alta desde el catálogo del ejercicio propio', () => {
    expect(
      createTrackedExerciseRequestSchema.safeParse({
        origin: 'catalog',
        catalogId: 'pectorals/archer-push-up',
      }).success,
    ).toBe(true);

    expect(
      createTrackedExerciseRequestSchema.safeParse({
        origin: 'custom',
        name: 'Remo con mancuerna en banco',
        bodyPart: 'back',
      }).success,
    ).toBe(true);
  });

  it('no deja crear un ejercicio sin catálogo ni nombre propio', () => {
    expect(createTrackedExerciseRequestSchema.safeParse({ origin: 'catalog' }).success).toBe(false);
    expect(createTrackedExerciseRequestSchema.safeParse({ origin: 'custom' }).success).toBe(false);
    expect(
      createTrackedExerciseRequestSchema.safeParse({ catalogId: 'pectorals/archer-push-up' })
        .success,
    ).toBe(false);
  });

  it('representa el ejercicio propio con los campos del catálogo a nulo', () => {
    const parsed = trackedExerciseSchema.safeParse({
      id: EXERCISE_ID,
      name: 'Remo con mancuerna en banco',
      origin: 'custom',
      catalogId: null,
      muscle: null,
      bodyPart: 'back',
      gifUrl: null,
      notes: null,
      createdAt: '2026-09-07T18:00:00.000Z',
      archivedAt: null,
    });

    expect(parsed.success).toBe(true);
  });
});

describe('rutinas', () => {
  it('rechaza un rango de repeticiones invertido', () => {
    const request = {
      name: 'Empuje',
      items: [
        { trackedExerciseId: EXERCISE_ID, targetSets: 4, targetRepsMin: 12, targetRepsMax: 8 },
      ],
    };

    expect(createRoutineRequestSchema.safeParse(request).success).toBe(false);
  });

  it('acepta una rutina con un rango correcto', () => {
    const request = {
      name: 'Empuje',
      description: null,
      items: [
        { trackedExerciseId: EXERCISE_ID, targetSets: 4, targetRepsMin: 8, targetRepsMax: 12 },
      ],
    };

    expect(createRoutineRequestSchema.safeParse(request).success).toBe(true);
  });
});

describe('récords y usuario', () => {
  it('expone el valor del récord con el mismo formato que un peso', () => {
    const parsed = personalRecordSchema.safeParse({
      id: SET_ID,
      trackedExerciseId: EXERCISE_ID,
      kind: 'estimated_1rm',
      value: '104.50',
      setEntryId: SET_ID,
      achievedAt: '2026-09-07T18:30:00.000Z',
    });

    expect(parsed.success).toBe(true);
  });

  it('acepta un usuario sin alias ni foto de Telegram', () => {
    const parsed = userSchema.safeParse({
      id: EXERCISE_ID,
      telegramUserId: 123456789,
      firstName: 'Juan',
      username: null,
      photoUrl: null,
      locale: 'es',
      unitSystem: 'metric',
      createdAt: '2026-09-07T18:00:00.000Z',
    });

    expect(parsed.success).toBe(true);
  });
});
