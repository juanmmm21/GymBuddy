import {
  apiErrorSchema,
  exerciseStatsSchema,
  exportSessionPageSchema,
  logSetResponseSchema,
  trackedExerciseSchema,
  weeklyCalendarSchema,
  workoutSessionDetailSchema,
  type ExportedSession,
} from '@gymbuddy/shared';
import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { issueSessionToken } from '../src/auth/jwt';
import type { Database } from '../src/db/client';
import { personalRecord, setEntry } from '../src/db/schema';
import { app } from '../src/index';
import { asStrengthSet, seedUsers } from './fixtures';
import { envWithSecrets } from './worker-env';

const BASE = 'https://gymbuddy.test/api/v1';
const JWT_SECRET = 'un-secreto-de-sesion-para-las-pruebas';

const cardioEnv = (): Env => envWithSecrets({ JWT_SECRET });
const uuid = (): string => crypto.randomUUID();

async function bearer(userId: string): Promise<string> {
  const { token } = await issueSessionToken(userId, JWT_SECRET, new Date());

  return `Bearer ${token}`;
}

interface Call {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly token: string;
  readonly body?: unknown;
}

async function call({ method, path, token, body }: Call): Promise<Response> {
  const init: RequestInit =
    body === undefined
      ? { method, headers: { authorization: token } }
      : {
          method,
          headers: { authorization: token, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        };

  return app.request(`${BASE}${path}`, init, cardioEnv());
}

async function errorCode(response: Response): Promise<string> {
  return apiErrorSchema.parse(await response.json()).error.code;
}

describe('series de cardio', () => {
  let db: Database;
  let userId: string;
  let otherUserId: string;
  let token: string;
  let treadmillId: string;
  let benchId: string;
  let sessionId: string;

  beforeEach(async () => {
    const seeded = await seedUsers(env.DB);
    db = seeded.db;
    userId = seeded.userId;
    otherUserId = seeded.otherUserId;
    token = await bearer(seeded.userId);

    treadmillId = uuid();
    benchId = uuid();
    sessionId = uuid();
    await call({
      method: 'POST',
      path: '/exercises',
      token,
      body: { id: treadmillId, origin: 'custom', name: 'Cinta', bodyPart: 'cardio' },
    });
    await call({
      method: 'POST',
      path: '/exercises',
      token,
      body: { id: benchId, origin: 'custom', name: 'Press de banca', bodyPart: 'chest' },
    });
    await call({ method: 'POST', path: '/sessions', token, body: { id: sessionId } });
  });

  function postSet(body: Record<string, unknown>): Promise<Response> {
    return call({ method: 'POST', path: `/sessions/${sessionId}/sets`, token, body });
  }

  function cardioBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: uuid(),
      kind: 'cardio',
      trackedExerciseId: treadmillId,
      durationSeconds: 1_800,
      distanceMeters: 5_000,
      ...overrides,
    };
  }

  it('registra una serie de cardio con su duración y su distancia, sin marcas', async () => {
    const body = cardioBody();

    const response = await postSet(body);

    expect(response.status).toBe(201);
    const { set, records } = logSetResponseSchema.parse(await response.json());
    expect(set).toMatchObject({
      id: body.id,
      kind: 'cardio',
      durationSeconds: 1_800,
      distanceMeters: 5_000,
      isWarmup: false,
    });
    expect(records).toEqual([]);

    const [row] = await db
      .select()
      .from(setEntry)
      .where(eq(setEntry.id, String(body.id)));
    expect(row).toMatchObject({ kind: 'cardio', weightGrams: null, reps: null });
  });

  it('la distancia es opcional', async () => {
    const response = await postSet(cardioBody({ distanceMeters: undefined }));

    expect(response.status).toBe(201);
    const { set } = logSetResponseSchema.parse(await response.json());
    expect(set).toMatchObject({ kind: 'cardio', distanceMeters: null });
  });

  it('un cuerpo sin tipo sigue registrando fuerza, como lo manda la cola offline de antes', async () => {
    const response = await postSet({
      id: uuid(),
      trackedExerciseId: benchId,
      weight: '80.00',
      reps: 8,
    });

    expect(response.status).toBe(201);
    const { set } = logSetResponseSchema.parse(await response.json());
    expect(asStrengthSet(set)).toMatchObject({ kind: 'strength', weight: '80.00', reps: 8 });
  });

  it('rechaza una serie de cardio con kilos', async () => {
    const response = await postSet({
      id: uuid(),
      kind: 'cardio',
      trackedExerciseId: treadmillId,
      weight: '10.00',
      reps: 1,
    });

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe('validation_failed');
  });

  it('reenviar la misma serie de cardio no la duplica; cambiarla por debajo es un choque', async () => {
    const body = cardioBody();

    expect((await postSet(body)).status).toBe(201);
    const again = await postSet(body);
    expect(again.status).toBe(200);

    const changed = await postSet({ ...body, durationSeconds: 1_500 });
    expect(changed.status).toBe(409);
    expect(await errorCode(changed)).toBe('conflicting_write');

    const detail = await call({ method: 'GET', path: `/sessions/${sessionId}`, token });
    expect(workoutSessionDetailSchema.parse(await detail.json()).sets).toHaveLength(1);
  });

  it('corrige la duración y quita la distancia', async () => {
    const body = cardioBody();
    await postSet(body);

    const corrected = await call({
      method: 'PATCH',
      path: `/sessions/${sessionId}/sets/${String(body.id)}`,
      token,
      body: { durationSeconds: 2_100, distanceMeters: null },
    });

    expect(corrected.status).toBe(200);
    const { set, records } = logSetResponseSchema.parse(await corrected.json());
    expect(set).toMatchObject({ kind: 'cardio', durationSeconds: 2_100, distanceMeters: null });
    expect(records).toEqual([]);
  });

  it('no deja corregir kilos en una de cardio ni tiempo en una de fuerza', async () => {
    const cardio = cardioBody();
    await postSet(cardio);
    const strengthId = uuid();
    await postSet({ id: strengthId, trackedExerciseId: benchId, weight: '80.00', reps: 8 });

    const kilosOnCardio = await call({
      method: 'PATCH',
      path: `/sessions/${sessionId}/sets/${String(cardio.id)}`,
      token,
      body: { weight: '10.00' },
    });
    const timeOnStrength = await call({
      method: 'PATCH',
      path: `/sessions/${sessionId}/sets/${strengthId}`,
      token,
      body: { durationSeconds: 600 },
    });

    expect(kilosOnCardio.status).toBe(400);
    expect(await errorCode(kilosOnCardio)).toBe('validation_failed');
    expect(timeOnStrength.status).toBe(400);
    expect(await errorCode(timeOnStrength)).toBe('validation_failed');
  });

  it('el cardio no entra en el peso habitual, las marcas ni la última serie del ejercicio', async () => {
    // Mismo ejercicio a propósito: aunque alguien apunte cardio en una ficha de fuerza, lo que
    // se mide en gramos no puede leerlo como una serie sin peso.
    await postSet({ id: uuid(), trackedExerciseId: benchId, weight: '80.00', reps: 8 });
    await postSet(cardioBody({ trackedExerciseId: benchId }));

    const statsResponse = await call({ method: 'GET', path: `/stats/exercise/${benchId}`, token });
    const stats = exerciseStatsSchema.parse(await statsResponse.json());
    expect(stats.workingWeight).toMatchObject({ weight: '80.00', reps: 8 });
    expect(stats.points).toHaveLength(1);
    expect(stats.points[0]).toMatchObject({ topWeight: '80.00', setCount: 1 });

    const exerciseResponse = await call({ method: 'GET', path: `/exercises/${benchId}`, token });
    const exercise = trackedExerciseSchema.parse(await exerciseResponse.json());
    expect(exercise.lastSet).toMatchObject({ weight: '80.00', reps: 8 });

    const records = await db.select().from(personalRecord).where(eq(personalRecord.userId, userId));
    expect(records.map((record) => record.kind).sort()).toEqual([
      'estimated_1rm',
      'max_volume',
      'max_weight',
    ]);
  });

  it('la ficha lleva la última serie de cardio sin calentamiento, y la de fuerza no la mezcla', async () => {
    await postSet(cardioBody({ durationSeconds: 1_200, distanceMeters: 3_000 }));
    await postSet(cardioBody({ durationSeconds: 1_500, distanceMeters: undefined }));
    await postSet(cardioBody({ durationSeconds: 300, isWarmup: true }));
    await postSet({ id: uuid(), trackedExerciseId: benchId, weight: '80.00', reps: 8 });

    const listResponse = await call({ method: 'GET', path: '/exercises', token });
    const list = trackedExerciseSchema.array().parse(await listResponse.json());
    const treadmill = list.find((exercise) => exercise.id === treadmillId);
    const bench = list.find((exercise) => exercise.id === benchId);
    expect(treadmill?.lastCardioSet).toMatchObject({
      durationSeconds: 1_500,
      distanceMeters: null,
    });
    expect(treadmill?.lastSet).toBeNull();
    expect(bench?.lastCardioSet).toBeNull();

    const detailResponse = await call({ method: 'GET', path: `/exercises/${treadmillId}`, token });
    const detail = trackedExerciseSchema.parse(await detailResponse.json());
    expect(detail.lastCardioSet).toEqual(treadmill?.lastCardioSet);
  });

  it('la última serie de cardio es de cada cuenta', async () => {
    await postSet(cardioBody());
    const otherToken = await bearer(otherUserId);
    const otherTreadmillId = uuid();
    await call({
      method: 'POST',
      path: '/exercises',
      token: otherToken,
      body: { id: otherTreadmillId, origin: 'custom', name: 'Cinta', bodyPart: 'cardio' },
    });

    const response = await call({
      method: 'GET',
      path: `/exercises/${otherTreadmillId}`,
      token: otherToken,
    });

    expect(trackedExerciseSchema.parse(await response.json()).lastCardioSet).toBeNull();
  });

  it('un ejercicio de solo cardio no tiene peso habitual ni puntos en la gráfica', async () => {
    await postSet(cardioBody());

    const response = await call({ method: 'GET', path: `/stats/exercise/${treadmillId}`, token });
    const stats = exerciseStatsSchema.parse(await response.json());

    expect(stats.workingWeight).toBeNull();
    expect(stats.points).toEqual([]);
    expect(stats.records).toEqual([]);
  });

  it('borrar una serie de cardio no toca las marcas de nadie', async () => {
    await postSet({ id: uuid(), trackedExerciseId: benchId, weight: '80.00', reps: 8 });
    const cardio = cardioBody();
    await postSet(cardio);

    const removed = await call({
      method: 'DELETE',
      path: `/sessions/${sessionId}/sets/${String(cardio.id)}`,
      token,
    });

    expect(removed.status).toBe(204);
    const records = await db.select().from(personalRecord).where(eq(personalRecord.userId, userId));
    expect(records).toHaveLength(3);
  });

  it('la semana cuenta el cardio como serie de un día entrenado', async () => {
    await postSet(cardioBody());
    await postSet(cardioBody());

    const response = await call({ method: 'GET', path: '/stats/week', token });
    const calendar = weeklyCalendarSchema.parse(await response.json());
    const trained = calendar.days.filter((day) => day.trained);

    expect(trained).toHaveLength(1);
    expect(trained[0]).toMatchObject({
      bodyParts: [{ bodyPart: 'cardio', setCount: 2, volume: '0.00' }],
      setCount: 2,
      volume: '0.00',
    });
  });

  it('la copia exporta la serie de cardio y la importa en otra cuenta tal cual', async () => {
    const cardio = cardioBody({ distanceMeters: 4_250 });
    await postSet(cardio);
    await call({ method: 'POST', path: `/sessions/${sessionId}/end`, token, body: {} });

    const exported = await call({ method: 'GET', path: '/export/sessions?limit=50', token });
    const page = exportSessionPageSchema.parse(await exported.json());
    const session = page.items[0];
    if (session === undefined) throw new Error('La exportación no trajo la sesión');
    expect(session.sets).toEqual([
      expect.objectContaining({
        kind: 'cardio',
        durationSeconds: 1_800,
        distanceMeters: 4_250,
      }),
    ]);
    expect(session.sets[0]).not.toHaveProperty('records');

    const otherToken = await bearer(otherUserId);
    const imported = await call({
      method: 'POST',
      path: '/import/exercises',
      token: otherToken,
      body: {
        exercises: [
          {
            id: treadmillId,
            origin: 'custom',
            catalogId: null,
            name: 'Cinta',
            muscle: null,
            bodyPart: 'cardio',
            notes: null,
            createdAt: '2026-09-15T10:00:00.000Z',
            archivedAt: null,
            unilateral: false,
          },
        ],
      },
    });
    expect(imported.status).toBe(200);

    const importedSessions = await call({
      method: 'POST',
      path: '/import/sessions',
      token: otherToken,
      body: { sessions: [session satisfies ExportedSession] },
    });
    expect(importedSessions.status).toBe(204);

    const otherPage = exportSessionPageSchema.parse(
      await (
        await call({ method: 'GET', path: '/export/sessions?limit=50', token: otherToken })
      ).json(),
    );
    expect(otherPage.items[0]?.sets).toEqual([
      expect.objectContaining({ kind: 'cardio', durationSeconds: 1_800, distanceMeters: 4_250 }),
    ]);
  });
});
