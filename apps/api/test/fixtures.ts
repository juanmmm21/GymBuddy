import { createDatabase, type Database } from '../src/db/client';
import {
  loginNonce,
  personalRecord,
  routine,
  routineItem,
  setEntry,
  trackedExercise,
  user,
  workoutSession,
  type NewSetEntryRow,
} from '../src/db/schema';

export interface SeededUsers {
  db: Database;
  userId: string;
  otherUserId: string;
}

export interface TrainingScenario extends SeededUsers {
  benchId: string;
  squatId: string;
  /** Un ejercicio del segundo usuario: es lo que prueba que lo ajeno responde 404. */
  otherExerciseId: string;
  /** Sesiones del usuario principal, de la más antigua a la más reciente. */
  sessionIds: [string, string, string];
}

const day = (isoDay: string, time: string): string => `${isoDay}T${time}.000Z`;

/**
 * Escenario sintético mínimo pero completo: dos ejercicios, tres sesiones repartidas y un
 * segundo usuario con datos propios, que es lo que permite comprobar que las consultas
 * no se llevan por delante el filtro por usuario.
 */
export async function seedTrainingScenario(binding: D1Database): Promise<TrainingScenario> {
  const db = createDatabase(binding);
  await resetTrainingTables(db);

  const userId = crypto.randomUUID();
  const otherUserId = crypto.randomUUID();
  const benchId = crypto.randomUUID();
  const squatId = crypto.randomUUID();
  const otherExerciseId = crypto.randomUUID();
  const sessionIds: [string, string, string] = [
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
  ];
  const otherSessionId = crypto.randomUUID();

  await db.insert(user).values([
    {
      id: userId,
      telegramUserId: 100_001,
      firstName: 'Juan',
      username: 'juanmmm21',
      photoUrl: null,
      locale: 'es',
      unitSystem: 'metric',
      createdAt: day('2026-08-01', '08:00:00'),
    },
    {
      id: otherUserId,
      telegramUserId: 100_002,
      firstName: 'Otra',
      username: null,
      photoUrl: null,
      locale: 'en',
      unitSystem: 'metric',
      createdAt: day('2026-08-01', '09:00:00'),
    },
  ]);

  await db.insert(trackedExercise).values([
    {
      id: benchId,
      userId,
      catalogId: null,
      customName: 'Press de banca',
      customMuscle: 'pectorals',
      customBodyPart: 'chest',
      notes: null,
      createdAt: day('2026-08-01', '08:05:00'),
      archivedAt: null,
    },
    {
      id: squatId,
      userId,
      catalogId: null,
      customName: 'Sentadilla',
      customMuscle: 'quads',
      customBodyPart: 'legs',
      notes: null,
      createdAt: day('2026-08-01', '08:06:00'),
      archivedAt: null,
    },
    {
      id: otherExerciseId,
      userId: otherUserId,
      catalogId: null,
      customName: 'Press de banca',
      customMuscle: 'pectorals',
      customBodyPart: 'chest',
      notes: null,
      createdAt: day('2026-08-01', '09:05:00'),
      archivedAt: null,
    },
  ]);

  await db.insert(workoutSession).values([
    {
      id: sessionIds[0],
      userId,
      startedAt: day('2026-08-10', '18:00:00'),
      endedAt: day('2026-08-10', '19:10:00'),
      notes: null,
      source: 'web',
    },
    {
      id: sessionIds[1],
      userId,
      startedAt: day('2026-08-17', '18:00:00'),
      endedAt: day('2026-08-17', '19:05:00'),
      notes: null,
      source: 'web',
    },
    {
      id: sessionIds[2],
      userId,
      startedAt: day('2026-08-24', '18:00:00'),
      endedAt: null,
      notes: 'Sesión sin cerrar',
      source: 'bot',
    },
    {
      id: otherSessionId,
      userId: otherUserId,
      startedAt: day('2026-08-24', '18:30:00'),
      endedAt: null,
      notes: null,
      source: 'web',
    },
  ]);

  const sets: NewSetEntryRow[] = [
    // La sesión más antigua es solo de pierna: no debe aparecer en el histórico de banca.
    set(sessionIds[0], squatId, 0, 100_000, 5, day('2026-08-10', '18:15:00')),
    set(sessionIds[0], squatId, 1, 100_000, 5, day('2026-08-10', '18:22:00')),

    set(sessionIds[1], benchId, 0, 60_000, 10, day('2026-08-17', '18:10:00'), { isWarmup: true }),
    set(sessionIds[1], benchId, 1, 80_000, 8, day('2026-08-17', '18:18:00'), { rpeTenths: 80 }),

    set(sessionIds[2], benchId, 0, 60_000, 10, day('2026-08-24', '18:10:00'), { isWarmup: true }),
    set(sessionIds[2], benchId, 1, 82_500, 8, day('2026-08-24', '18:18:00'), { rpeTenths: 85 }),
    set(sessionIds[2], benchId, 2, 82_500, 7, day('2026-08-24', '18:26:00'), { rpeTenths: 95 }),
    set(sessionIds[2], squatId, 3, 102_500, 5, day('2026-08-24', '18:40:00')),

    set(otherSessionId, otherExerciseId, 0, 50_000, 12, day('2026-08-24', '18:40:00')),
  ];

  await db.insert(setEntry).values(sets);

  return { db, userId, otherUserId, benchId, squatId, otherExerciseId, sessionIds };
}

/**
 * Dos usuarios y nada más, para los tests que escriben su propio historial desde la API.
 * El segundo existe siempre: sin alguien al lado no se puede comprobar que las rutas
 * filtran por el usuario del contexto y no por el identificador de la URL.
 */
export async function seedUsers(binding: D1Database): Promise<SeededUsers> {
  const db = createDatabase(binding);
  await resetTrainingTables(db);

  const userId = crypto.randomUUID();
  const otherUserId = crypto.randomUUID();

  await db.insert(user).values([
    {
      id: userId,
      telegramUserId: 100_001,
      firstName: 'Juan',
      username: 'juanmmm21',
      photoUrl: null,
      locale: 'es',
      unitSystem: 'metric',
      createdAt: day('2026-08-01', '08:00:00'),
    },
    {
      id: otherUserId,
      telegramUserId: 100_002,
      firstName: 'Otra',
      username: null,
      photoUrl: null,
      locale: 'en',
      unitSystem: 'metric',
      createdAt: day('2026-08-01', '09:00:00'),
    },
  ]);

  return { db, userId, otherUserId };
}

/**
 * Vacía los datos de usuario antes de sembrar. El pool comparte la base entre los tests
 * de un mismo fichero, así que sin esto la segunda siembra choca con la clave única de
 * Telegram. El catálogo no se toca: lo llena su propia sincronización.
 */
export async function resetTrainingTables(db: Database): Promise<void> {
  // En orden inverso a las dependencias: D1 aplica las claves ajenas.
  await db.delete(personalRecord);
  await db.delete(routineItem);
  await db.delete(routine);
  await db.delete(setEntry);
  await db.delete(workoutSession);
  await db.delete(trackedExercise);
  await db.delete(loginNonce);
  await db.delete(user);
}

function set(
  sessionId: string,
  trackedExerciseId: string,
  orderIndex: number,
  weightGrams: number,
  reps: number,
  completedAt: string,
  extra: { rpeTenths?: number; isWarmup?: boolean } = {},
): NewSetEntryRow {
  return {
    id: crypto.randomUUID(),
    sessionId,
    trackedExerciseId,
    orderIndex,
    weightGrams,
    reps,
    rpeTenths: extra.rpeTenths ?? null,
    isWarmup: extra.isWarmup ?? false,
    completedAt,
    source: 'web',
  };
}
