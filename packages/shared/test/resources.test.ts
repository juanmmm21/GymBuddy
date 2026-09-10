import { describe, expect, it } from 'vitest';
import {
  MAX_ROUTINE_DESCRIPTION_LENGTH,
  MAX_ROUTINE_NAME_LENGTH,
  MAX_ROUTINE_TARGET_REPS,
  MAX_ROUTINE_TARGET_SETS,
  routineItemInputSchema,
  routineNameSchema,
  activeSessionResponseSchema,
  bodyPartSchema,
  catalogExercisePageSchema,
  catalogSyncStepSchema,
  createRoutineRequestSchema,
  createTrackedExerciseRequestSchema,
  routineSchema,
  updateRoutineRequestSchema,
  exerciseHistorySchema,
  logSetRequestSchema,
  updateSetRequestSchema,
  updateTrackedExerciseRequestSchema,
  muscleSchema,
  personalRecordSchema,
  setEntrySchema,
  startSessionRequestSchema,
  trackedExerciseSchema,
  userSchema,
  weeklyCalendarSchema,
  workoutSessionDetailSchema,
  workoutSessionPageSchema,
} from '../src/schemas/index';

const EXERCISE_ID = '3f6c2b1a-58e6-4c65-9d0e-2b1a4c7f8d31';
const SESSION_ID = 'a0c14d2f-9b7e-4a11-8f3c-6d5e2a9b0c74';
const SET_ID = 'd41f7b90-3c22-4e58-9a6b-1f0c8e7d5a23';
const ROUTINE_ID = '8b2e5c07-6a41-4d93-b7f8-0c3a1e6d9b52';
const ROUTINE_ITEM_ID = 'c7d90a12-4e83-4b60-95af-31d2e8c74b06';

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

  it('corrige solo lo que se toca y acepta la petición vacía', () => {
    expect(updateSetRequestSchema.safeParse({}).success).toBe(true);
    expect(updateSetRequestSchema.safeParse({ weight: '80.00' }).success).toBe(true);
    expect(updateSetRequestSchema.safeParse({ reps: 6, isWarmup: true }).success).toBe(true);
  });

  it('deja quitar un rpe anotado por error, pero no inventarse uno fuera de paso', () => {
    expect(updateSetRequestSchema.safeParse({ rpe: null }).success).toBe(true);
    expect(updateSetRequestSchema.safeParse({ rpe: 8.5 }).success).toBe(true);
    expect(updateSetRequestSchema.safeParse({ rpe: 8.3 }).success).toBe(false);
  });

  it('no deja mover una serie de ejercicio ni de momento al corregirla', () => {
    const parsed = updateSetRequestSchema.safeParse({
      weight: '80.00',
      trackedExerciseId: EXERCISE_ID,
      completedAt: '2026-09-07T18:30:00.000Z',
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ weight: '80.00' });
  });

  it('mantiene el peso y las repeticiones dentro de lo registrable al corregir', () => {
    expect(updateSetRequestSchema.safeParse({ weight: '80.5' }).success).toBe(false);
    expect(updateSetRequestSchema.safeParse({ reps: 0 }).success).toBe(false);
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

  it('renombra un ejercicio recortando lo que se teclea de más', () => {
    const parsed = updateTrackedExerciseRequestSchema.safeParse({ name: '  Remo Pendlay  ' });

    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ name: 'Remo Pendlay' });
  });

  it('no acepta un nombre vacío ni de solo espacios', () => {
    expect(updateTrackedExerciseRequestSchema.safeParse({ name: '' }).success).toBe(false);
    expect(updateTrackedExerciseRequestSchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('deja tocar por separado el nombre, las notas y el archivado', () => {
    expect(updateTrackedExerciseRequestSchema.safeParse({}).success).toBe(true);
    expect(updateTrackedExerciseRequestSchema.safeParse({ notes: null }).success).toBe(true);
    expect(updateTrackedExerciseRequestSchema.safeParse({ archived: true }).success).toBe(true);
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
  const item = {
    id: ROUTINE_ITEM_ID,
    trackedExerciseId: EXERCISE_ID,
    targetSets: 4,
    targetRepsMin: 8,
    targetRepsMax: 12,
  };

  it('rechaza un rango de repeticiones invertido', () => {
    const request = {
      id: ROUTINE_ID,
      name: 'Empuje',
      items: [{ ...item, targetRepsMin: 12, targetRepsMax: 8 }],
    };

    expect(createRoutineRequestSchema.safeParse(request).success).toBe(false);
  });

  it('acepta una rutina con un rango correcto', () => {
    const request = { id: ROUTINE_ID, name: 'Empuje', description: null, items: [item] };

    expect(createRoutineRequestSchema.safeParse(request).success).toBe(true);
  });

  it('exige el identificador de la rutina y el de cada ejercicio: los pone el cliente', () => {
    const { id: _routineId, ...withoutRoutineId } = { id: ROUTINE_ID, name: 'Empuje', items: [] };
    const { id: _itemId, ...withoutItemId } = item;

    expect(createRoutineRequestSchema.safeParse(withoutRoutineId).success).toBe(false);
    expect(
      createRoutineRequestSchema.safeParse({
        id: ROUTINE_ID,
        name: 'Empuje',
        items: [withoutItemId],
      }).success,
    ).toBe(false);
  });

  it('no acepta el orden dentro de la petición: lo da la posición en la lista', () => {
    const request = {
      id: ROUTINE_ID,
      name: 'Empuje',
      items: [{ ...item, orderIndex: 3 }],
    };

    const parsed = createRoutineRequestSchema.parse(request);

    expect(parsed.items[0]).not.toHaveProperty('orderIndex');
  });

  it('recorta el nombre y rechaza el que solo tiene espacios', () => {
    expect(
      createRoutineRequestSchema.parse({ id: ROUTINE_ID, name: '  Empuje  ', items: [] }).name,
    ).toBe('Empuje');
    expect(
      createRoutineRequestSchema.safeParse({ id: ROUTINE_ID, name: '   ', items: [] }).success,
    ).toBe(false);
  });

  it('acepta una rutina sin ejercicios: es como nace en el editor', () => {
    expect(
      createRoutineRequestSchema.safeParse({ id: ROUTINE_ID, name: 'Empuje', items: [] }).success,
    ).toBe(true);
  });

  it('no acepta más de treinta ejercicios en una rutina', () => {
    const items = Array.from({ length: 31 }, () => item);

    expect(
      createRoutineRequestSchema.safeParse({ id: ROUTINE_ID, name: 'Empuje', items }).success,
    ).toBe(false);
  });

  it('deja cambiar solo lo que se toca, y archivar es un campo más', () => {
    expect(updateRoutineRequestSchema.safeParse({}).success).toBe(true);
    expect(updateRoutineRequestSchema.safeParse({ archived: true }).success).toBe(true);
    expect(updateRoutineRequestSchema.safeParse({ description: null }).success).toBe(true);
    expect(
      updateRoutineRequestSchema.safeParse({ items: [{ ...item, targetRepsMax: 1 }] }).success,
    ).toBe(false);
  });

  it('la rutina que sale lleva el orden resuelto', () => {
    const routine = {
      id: ROUTINE_ID,
      name: 'Empuje',
      description: null,
      createdAt: '2026-09-09T18:00:00.000Z',
      archivedAt: null,
      items: [{ ...item, orderIndex: 0 }],
    };

    expect(routineSchema.parse(routine).items[0]?.orderIndex).toBe(0);
    expect(routineSchema.safeParse({ ...routine, items: [item] }).success).toBe(false);
  });

  it('los topes exportados son los que aplica el esquema, ni uno más ni uno menos', () => {
    expect(
      routineItemInputSchema.safeParse({ ...item, targetSets: MAX_ROUTINE_TARGET_SETS }).success,
    ).toBe(true);
    expect(
      routineItemInputSchema.safeParse({ ...item, targetSets: MAX_ROUTINE_TARGET_SETS + 1 })
        .success,
    ).toBe(false);
    expect(
      routineItemInputSchema.safeParse({
        ...item,
        targetRepsMin: MAX_ROUTINE_TARGET_REPS,
        targetRepsMax: MAX_ROUTINE_TARGET_REPS,
      }).success,
    ).toBe(true);
    expect(
      routineItemInputSchema.safeParse({ ...item, targetRepsMax: MAX_ROUTINE_TARGET_REPS + 1 })
        .success,
    ).toBe(false);

    const name = 'a'.repeat(MAX_ROUTINE_NAME_LENGTH);
    expect(routineNameSchema.safeParse(name).success).toBe(true);
    expect(routineNameSchema.safeParse(`${name}a`).success).toBe(false);

    const description = 'a'.repeat(MAX_ROUTINE_DESCRIPTION_LENGTH);
    expect(updateRoutineRequestSchema.safeParse({ description }).success).toBe(true);
    expect(updateRoutineRequestSchema.safeParse({ description: `${description}a` }).success).toBe(
      false,
    );
  });

  it('el esquema de una línea suelta ya rechaza el rango invertido', () => {
    expect(routineItemInputSchema.safeParse(item).success).toBe(true);
    expect(
      routineItemInputSchema.safeParse({ ...item, targetRepsMin: 9, targetRepsMax: 8 }).success,
    ).toBe(false);
    expect(
      routineItemInputSchema.safeParse({ ...item, targetRepsMin: 8, targetRepsMax: 8 }).success,
    ).toBe(true);
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

describe('calendario de la semana', () => {
  const day = (dayIndex: number, date: string) => ({
    dayIndex,
    date,
    trained: false,
    bodyPart: null,
    volume: '0.00',
    setCount: 0,
  });

  const week = [
    { ...day(0, '2026-09-07'), trained: true, bodyPart: 'chest', volume: '1320.00', setCount: 4 },
    day(1, '2026-09-08'),
    day(2, '2026-09-09'),
    { ...day(3, '2026-09-10'), trained: true },
    day(4, '2026-09-11'),
    day(5, '2026-09-12'),
    day(6, '2026-09-13'),
  ];

  it('acepta la semana entera, con su día entrenado sin parte del cuerpo clasificable', () => {
    const parsed = weeklyCalendarSchema.safeParse({
      generatedAt: '2026-09-10T18:00:00.000Z',
      weekStart: '2026-09-07',
      days: week,
    });

    expect(parsed.success).toBe(true);
  });

  it('exige los siete días: un hueco lo tendría que rellenar la pantalla', () => {
    const parsed = weeklyCalendarSchema.safeParse({
      generatedAt: '2026-09-10T18:00:00.000Z',
      weekStart: '2026-09-07',
      days: week.slice(0, 6),
    });

    expect(parsed.success).toBe(false);
  });

  it('la etiqueta del día es una parte del cuerpo, no un músculo', () => {
    const parsed = weeklyCalendarSchema.safeParse({
      generatedAt: '2026-09-10T18:00:00.000Z',
      weekStart: '2026-09-07',
      days: [{ ...week[0], bodyPart: 'pectorals' }, ...week.slice(1)],
    });

    expect(parsed.success).toBe(false);
  });
});
