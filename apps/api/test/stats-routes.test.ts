import {
  apiErrorSchema,
  exerciseStatsSchema,
  logSetResponseSchema,
  trainingSignalsSchema,
} from '@gymbuddy/shared';
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { issueSessionToken } from '../src/auth/jwt';
import type { Database } from '../src/db/client';
import { setEntry, trackedExercise, workoutSession } from '../src/db/schema';
import { app } from '../src/index';
import { seedUsers } from './fixtures';
import { envWithSecrets } from './worker-env';

const BASE = 'https://gymbuddy.test/api/v1';
const JWT_SECRET = 'un-secreto-de-sesion-para-las-pruebas';

const statsEnv = (): Env => envWithSecrets({ JWT_SECRET });
const uuid = (): string => crypto.randomUUID();

async function bearer(userId: string): Promise<string> {
  const { token } = await issueSessionToken(userId, JWT_SECRET, new Date());

  return `Bearer ${token}`;
}

async function get(path: string, token: string): Promise<Response> {
  return app.request(`${BASE}${path}`, { headers: { authorization: token } }, statsEnv());
}

/**
 * Historial sintético escrito directamente en la base: las estadísticas se leen de series
 * repartidas por varias semanas y montarlas por la API pediría abrir y cerrar sesiones.
 */
async function seedExerciseHistory(
  db: Database,
  userId: string,
  sessions: readonly { day: string; sets: readonly [number, number][] }[],
): Promise<string> {
  const exerciseId = uuid();
  await db.insert(trackedExercise).values({
    id: exerciseId,
    userId,
    catalogId: null,
    customName: 'Press de banca',
    customMuscle: 'pectorals',
    customBodyPart: 'chest',
    notes: null,
    createdAt: '2026-07-01T08:00:00.000Z',
    archivedAt: null,
  });

  for (const session of sessions) {
    const sessionId = uuid();
    await db.insert(workoutSession).values({
      id: sessionId,
      userId,
      startedAt: `${session.day}T18:00:00.000Z`,
      endedAt: `${session.day}T19:00:00.000Z`,
      notes: null,
      source: 'web',
    });

    await db.insert(setEntry).values(
      session.sets.map(([weightGrams, reps], index) => ({
        id: uuid(),
        sessionId,
        trackedExerciseId: exerciseId,
        orderIndex: index,
        weightGrams,
        reps,
        rpeTenths: null,
        isWarmup: false,
        completedAt: `${session.day}T18:${String(10 + index * 5).padStart(2, '0')}:00.000Z`,
        source: 'web' as const,
      })),
    );
  }

  return exerciseId;
}

describe('estadísticas de un ejercicio', () => {
  let db: Database;
  let userId: string;
  let otherUserId: string;
  let token: string;
  let otherToken: string;

  beforeEach(async () => {
    ({ db, userId, otherUserId } = await seedUsers(env.DB));
    token = await bearer(userId);
    otherToken = await bearer(otherUserId);
  });

  it('resuelve el peso habitual, la gráfica y las marcas vigentes', async () => {
    const exerciseId = await seedExerciseHistory(db, userId, [
      { day: '2026-08-10', sets: [[80_000, 8]] },
      { day: '2026-08-17', sets: [[82_500, 8]] },
      { day: '2026-08-24', sets: [[82_500, 6]] },
    ]);

    const response = await get(`/stats/exercise/${exerciseId}`, token);
    expect(response.status).toBe(200);

    const stats = exerciseStatsSchema.parse(await response.json());
    // Mediana de 80, 82.5 y 82.5.
    expect(stats.workingWeight?.weight).toBe('82.50');
    expect(stats.workingWeight?.sessionCount).toBe(3);
    // Las repeticiones son las de la última vez, no las de la mediana.
    expect(stats.workingWeight?.reps).toBe(6);

    // De la más antigua a la más reciente: es como se lee un eje temporal.
    expect(stats.points.map((point) => point.topWeight)).toStrictEqual(['80.00', '82.50', '82.50']);
    expect(stats.points[0]?.estimatedOneRepMax).toBe('101.33');
    expect(stats.points[0]?.volume).toBe('640.00');

    // Todavía no hay récords: la tabla solo la escribe el registro de una serie.
    expect(stats.records).toStrictEqual([]);
  });

  it('un ejercicio sin series no tiene peso habitual pero sí responde', async () => {
    const exerciseId = await seedExerciseHistory(db, userId, []);

    const stats = exerciseStatsSchema.parse(
      await (await get(`/stats/exercise/${exerciseId}`, token)).json(),
    );

    expect(stats.workingWeight).toBeNull();
    expect(stats.points).toStrictEqual([]);
    expect(stats.stalled).toBeNull();
  });

  it('avisa del estancamiento con el incremento que toca a esa parte del cuerpo', async () => {
    const exerciseId = await seedExerciseHistory(db, userId, [
      { day: '2026-08-10', sets: [[82_500, 8]] },
      { day: '2026-08-17', sets: [[82_500, 8]] },
      { day: '2026-08-24', sets: [[82_500, 9]] },
    ]);

    const stats = exerciseStatsSchema.parse(
      await (await get(`/stats/exercise/${exerciseId}`, token)).json(),
    );

    expect(stats.stalled).toStrictEqual({
      trackedExerciseId: exerciseId,
      weight: '82.50',
      sessions: 3,
      // El pecho sube con el disco pequeño.
      suggestedIncrement: '2.50',
    });
  });

  it('el ejercicio de otro usuario responde 404, no una gráfica vacía', async () => {
    const exerciseId = await seedExerciseHistory(db, userId, [
      { day: '2026-08-24', sets: [[82_500, 8]] },
    ]);

    const response = await get(`/stats/exercise/${exerciseId}`, otherToken);

    expect(response.status).toBe(404);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe('not_found');
  });

  it('sin sesión no se ven estadísticas de nadie', async () => {
    const response = await app.request(`${BASE}/stats/signals`, {}, statsEnv());

    expect(response.status).toBe(401);
  });
});

describe('señales de entrenamiento', () => {
  let db: Database;
  let userId: string;
  let token: string;

  beforeEach(async () => {
    ({ db, userId } = await seedUsers(env.DB));
    token = await bearer(userId);
  });

  it('sin historial no hay días sin entrenar, y eso no es cero', async () => {
    const signals = trainingSignalsSchema.parse(await (await get('/stats/signals', token)).json());

    expect(signals.lastSessionAt).toBeNull();
    expect(signals.daysSinceLastSession).toBeNull();
    expect(signals.weeklyStreak).toBe(0);
    expect(signals.activeSessionId).toBeNull();
    expect(signals.latestRecord).toBeNull();
    expect(signals.stalled).toStrictEqual([]);
  });

  it('marca la sesión abierta y lista los ejercicios atascados', async () => {
    const exerciseId = await seedExerciseHistory(db, userId, [
      { day: '2026-08-10', sets: [[100_000, 5]] },
      { day: '2026-08-17', sets: [[100_000, 5]] },
      { day: '2026-08-24', sets: [[100_000, 5]] },
    ]);

    const openSessionId = uuid();
    await db.insert(workoutSession).values({
      id: openSessionId,
      userId,
      startedAt: new Date().toISOString(),
      endedAt: null,
      notes: null,
      source: 'web',
    });

    const signals = trainingSignalsSchema.parse(await (await get('/stats/signals', token)).json());

    expect(signals.activeSessionId).toBe(openSessionId);
    expect(signals.stalled).toStrictEqual([
      {
        trackedExerciseId: exerciseId,
        weight: '100.00',
        sessions: 3,
        suggestedIncrement: '2.50',
      },
    ]);
  });

  it('un ejercicio archivado deja de sugerir subir peso', async () => {
    const exerciseId = await seedExerciseHistory(db, userId, [
      { day: '2026-08-10', sets: [[100_000, 5]] },
      { day: '2026-08-17', sets: [[100_000, 5]] },
      { day: '2026-08-24', sets: [[100_000, 5]] },
    ]);

    const archived = await app.request(
      `${BASE}/exercises/${exerciseId}`,
      {
        method: 'PATCH',
        headers: { authorization: token, 'content-type': 'application/json' },
        body: JSON.stringify({ archived: true }),
      },
      statsEnv(),
    );
    expect(archived.status).toBe(200);

    const signals = trainingSignalsSchema.parse(await (await get('/stats/signals', token)).json());

    expect(signals.stalled).toStrictEqual([]);
  });
});

describe('récords personales', () => {
  let db: Database;
  let userId: string;
  let token: string;

  beforeEach(async () => {
    ({ db, userId } = await seedUsers(env.DB));
    token = await bearer(userId);
  });

  async function openSession(): Promise<{ sessionId: string; exerciseId: string }> {
    const exerciseId = await seedExerciseHistory(db, userId, []);
    const sessionId = uuid();

    const opened = await app.request(
      `${BASE}/sessions`,
      {
        method: 'POST',
        headers: { authorization: token, 'content-type': 'application/json' },
        body: JSON.stringify({ id: sessionId, source: 'web' }),
      },
      statsEnv(),
    );
    expect(opened.status).toBe(201);

    return { sessionId, exerciseId };
  }

  async function logSet(
    sessionId: string,
    body: Record<string, unknown>,
  ): Promise<ReturnType<typeof logSetResponseSchema.parse>> {
    const response = await app.request(
      `${BASE}/sessions/${sessionId}/sets`,
      {
        method: 'POST',
        headers: { authorization: token, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
      statsEnv(),
    );

    return logSetResponseSchema.parse(await response.json());
  }

  it('la primera serie efectiva estrena las tres marcas y la siguiente solo lo que supera', async () => {
    const { sessionId, exerciseId } = await openSession();

    const first = await logSet(sessionId, {
      id: uuid(),
      trackedExerciseId: exerciseId,
      weight: '80.00',
      reps: 8,
      source: 'web',
    });
    expect(first.records.map((record) => record.kind)).toStrictEqual([
      'max_weight',
      'estimated_1rm',
      'max_volume',
    ]);
    expect(first.records[0]?.value).toBe('80.00');

    // 85 × 5: más peso, pero peor 1RM estimado y menos volumen.
    const second = await logSet(sessionId, {
      id: uuid(),
      trackedExerciseId: exerciseId,
      weight: '85.00',
      reps: 5,
      source: 'web',
    });
    expect(second.records.map((record) => record.kind)).toStrictEqual(['max_weight']);

    const stats = exerciseStatsSchema.parse(
      await (await get(`/stats/exercise/${exerciseId}`, token)).json(),
    );
    expect(
      Object.fromEntries(stats.records.map((record) => [record.kind, record.value])),
    ).toStrictEqual({
      max_weight: '85.00',
      estimated_1rm: '101.33',
      max_volume: '640.00',
    });
  });

  it('reenviar la misma serie no vuelve a marcar récord', async () => {
    const { sessionId, exerciseId } = await openSession();
    const body = {
      id: uuid(),
      trackedExerciseId: exerciseId,
      weight: '80.00',
      reps: 8,
      source: 'web',
    };

    expect((await logSet(sessionId, body)).records).toHaveLength(3);
    expect((await logSet(sessionId, body)).records).toStrictEqual([]);

    const stats = exerciseStatsSchema.parse(
      await (await get(`/stats/exercise/${exerciseId}`, token)).json(),
    );
    expect(stats.records).toHaveLength(3);
  });

  it('el calentamiento no marca récord por pesado que sea', async () => {
    const { sessionId, exerciseId } = await openSession();

    const warmup = await logSet(sessionId, {
      id: uuid(),
      trackedExerciseId: exerciseId,
      weight: '200.00',
      reps: 10,
      isWarmup: true,
      source: 'web',
    });

    expect(warmup.records).toStrictEqual([]);
  });

  it('una serie floja no se corona récord solo porque la tabla estuviera vacía', async () => {
    // Historial previo sin marcas guardadas: es el estado de quien ya entrenaba antes de
    // que existiera la detección de récords.
    const exerciseId = await seedExerciseHistory(db, userId, [
      { day: '2026-08-17', sets: [[100_000, 8]] },
    ]);

    const sessionId = uuid();
    await app.request(
      `${BASE}/sessions`,
      {
        method: 'POST',
        headers: { authorization: token, 'content-type': 'application/json' },
        body: JSON.stringify({ id: sessionId, source: 'web' }),
      },
      statsEnv(),
    );

    const logged = await logSet(sessionId, {
      id: uuid(),
      trackedExerciseId: exerciseId,
      weight: '70.00',
      reps: 5,
      source: 'web',
    });

    expect(logged.records).toStrictEqual([]);
  });

  it('el último récord aparece en las señales', async () => {
    const { sessionId, exerciseId } = await openSession();
    await logSet(sessionId, {
      id: uuid(),
      trackedExerciseId: exerciseId,
      weight: '80.00',
      reps: 8,
      source: 'web',
    });

    const signals = trainingSignalsSchema.parse(await (await get('/stats/signals', token)).json());

    expect(signals.latestRecord?.trackedExerciseId).toBe(exerciseId);
    expect(signals.activeSessionId).toBe(sessionId);
  });
});
