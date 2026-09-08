import { describe, expect, it } from 'vitest';
import {
  activeSessionResponseSchema,
  bodyPartSchema,
  catalogExercisePageSchema,
  catalogSyncStepSchema,
  createRoutineRequestSchema,
  createTrackedExerciseRequestSchema,
  exerciseHistorySchema,
  logSetRequestSchema,
  muscleSchema,
  personalRecordSchema,
  setEntrySchema,
  startSessionRequestSchema,
  trackedExerciseSchema,
  userSchema,
  workoutSessionDetailSchema,
  workoutSessionPageSchema,
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

describe('página del catálogo', () => {
  const summary = {
    catalogId: 'pectorals/archer-push-up',
    name: 'Flexión del arquero',
    muscle: 'pectorals',
    bodyPart: 'chest',
    equipment: 'bodyweight',
    gifUrl:
      'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@v1.1.0/pectorals/archer-push-up.gif',
  };

  it('acepta una página con su total y su ventana', () => {
    const page = { items: [summary], total: 158, limit: 50, offset: 0 };

    expect(catalogExercisePageSchema.safeParse(page).success).toBe(true);
  });

  it('rechaza un límite de cero: una página vacía por definición no es una ventana válida', () => {
    expect(
      catalogExercisePageSchema.safeParse({ items: [], total: 0, limit: 0, offset: 0 }).success,
    ).toBe(false);
  });

  it('rechaza un resumen cuyo bodyPart sea en realidad un músculo', () => {
    const page = { items: [{ ...summary, bodyPart: 'pectorals' }], total: 1, limit: 50, offset: 0 };

    expect(catalogExercisePageSchema.safeParse(page).success).toBe(false);
  });
});

describe('estado de la sincronización del catálogo', () => {
  const status = {
    catalogVersion: 'v1.1.0',
    startedAt: '2026-09-08T10:00:00.000Z',
    updatedAt: '2026-09-08T10:05:00.000Z',
    completedAt: null,
    nextMuscle: 'adductors',
    exerciseCount: 174,
  };

  it('acepta un ciclo en marcha y uno terminado', () => {
    expect(
      catalogSyncStepSchema.safeParse({
        syncedMuscle: 'abs',
        exercisesUpserted: 169,
        staleExercisesRemoved: 0,
        status,
      }).success,
    ).toBe(true);

    expect(
      catalogSyncStepSchema.safeParse({
        syncedMuscle: 'upper-back',
        exercisesUpserted: 87,
        staleExercisesRemoved: 3,
        status: { ...status, completedAt: '2026-09-08T10:10:00.000Z', nextMuscle: null },
      }).success,
    ).toBe(true);
  });

  it('rechaza un músculo pendiente que no esté en el catálogo', () => {
    expect(
      catalogSyncStepSchema.safeParse({
        syncedMuscle: null,
        exercisesUpserted: 0,
        staleExercisesRemoved: 0,
        status: { ...status, nextMuscle: 'chest' },
      }).success,
    ).toBe(false);
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
      id: SET_ID,
      trackedExerciseId: EXERCISE_ID,
      weight: '60.00',
      reps: 10,
      source: 'bot',
    });

    expect(parsed.success).toBe(true);
  });

  it('exige el identificador de la serie: sin él la cola offline duplicaría al reenviar', () => {
    expect(
      logSetRequestSchema.safeParse({
        trackedExerciseId: EXERCISE_ID,
        weight: '60.00',
        reps: 10,
        source: 'bot',
      }).success,
    ).toBe(false);

    expect(
      logSetRequestSchema.safeParse({
        id: 'serie-1',
        trackedExerciseId: EXERCISE_ID,
        weight: '60.00',
        reps: 10,
        source: 'bot',
      }).success,
    ).toBe(false);
  });
});

describe('sesión', () => {
  it('exige el identificador al abrir, igual que al registrar una serie', () => {
    expect(startSessionRequestSchema.safeParse({ source: 'web' }).success).toBe(false);
    expect(startSessionRequestSchema.safeParse({ id: SESSION_ID, source: 'web' }).success).toBe(
      true,
    );
  });

  it('representa "no hay sesión en curso" como un nulo, no como una ausencia', () => {
    expect(activeSessionResponseSchema.safeParse({ session: null }).success).toBe(true);
    expect(activeSessionResponseSchema.safeParse({}).success).toBe(false);
  });

  it('acepta una página del historial con su recuento de series', () => {
    const page = {
      items: [
        {
          id: SESSION_ID,
          startedAt: '2026-09-07T18:00:00.000Z',
          endedAt: '2026-09-07T19:10:00.000Z',
          notes: null,
          source: 'web',
          setCount: 5,
        },
      ],
      total: 42,
      limit: 20,
      offset: 0,
    };

    expect(workoutSessionPageSchema.safeParse(page).success).toBe(true);
  });

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
        id: EXERCISE_ID,
        origin: 'catalog',
        catalogId: 'pectorals/archer-push-up',
      }).success,
    ).toBe(true);

    expect(
      createTrackedExerciseRequestSchema.safeParse({
        id: EXERCISE_ID,
        origin: 'custom',
        name: 'Remo con mancuerna en banco',
        bodyPart: 'back',
      }).success,
    ).toBe(true);
  });

  it('no deja crear un ejercicio sin catálogo ni nombre propio', () => {
    expect(
      createTrackedExerciseRequestSchema.safeParse({ id: EXERCISE_ID, origin: 'catalog' }).success,
    ).toBe(false);
    expect(
      createTrackedExerciseRequestSchema.safeParse({ id: EXERCISE_ID, origin: 'custom' }).success,
    ).toBe(false);
    expect(
      createTrackedExerciseRequestSchema.safeParse({ catalogId: 'pectorals/archer-push-up' })
        .success,
    ).toBe(false);
  });

  it('exige el identificador también al dar de alta un ejercicio', () => {
    expect(
      createTrackedExerciseRequestSchema.safeParse({
        origin: 'catalog',
        catalogId: 'pectorals/archer-push-up',
      }).success,
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
      workingWeight: null,
      createdAt: '2026-09-07T18:00:00.000Z',
      archivedAt: null,
    });

    expect(parsed.success).toBe(true);
  });

  it('lleva el peso habitual para precargar el formulario', () => {
    const parsed = trackedExerciseSchema.safeParse({
      id: EXERCISE_ID,
      name: 'Press de banca',
      origin: 'custom',
      catalogId: null,
      muscle: 'pectorals',
      bodyPart: 'chest',
      gifUrl: null,
      notes: null,
      workingWeight: {
        weight: '82.50',
        reps: 8,
        lastPerformedAt: '2026-09-07T18:30:00.000Z',
        sessionCount: 3,
      },
      createdAt: '2026-09-07T18:00:00.000Z',
      archivedAt: null,
    });

    expect(parsed.success).toBe(true);
  });
});

describe('historial de un ejercicio', () => {
  it('agrupa las series por la sesión en la que se hicieron', () => {
    const history = {
      trackedExerciseId: EXERCISE_ID,
      sessions: [
        {
          sessionId: SESSION_ID,
          startedAt: '2026-09-07T18:00:00.000Z',
          endedAt: null,
          sets: [
            {
              id: SET_ID,
              trackedExerciseId: EXERCISE_ID,
              orderIndex: 1,
              weight: '82.50',
              reps: 8,
              rpe: null,
              isWarmup: false,
              completedAt: '2026-09-07T18:30:00.000Z',
              source: 'web',
            },
          ],
        },
      ],
    };

    expect(exerciseHistorySchema.safeParse(history).success).toBe(true);
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
