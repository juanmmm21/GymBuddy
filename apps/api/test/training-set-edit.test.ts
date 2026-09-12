import {
  apiErrorSchema,
  exerciseStatsSchema,
  logSetResponseSchema,
  workoutSessionDetailSchema,
} from '@gymbuddy/shared';
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { issueSessionToken } from '../src/auth/jwt';
import type { Database } from '../src/db/client';
import { personalRecord } from '../src/db/schema';
import { app } from '../src/index';
import { seedUsers } from './fixtures';
import { envWithSecrets } from './worker-env';

const BASE = 'https://gymbuddy.test/api/v1';
const JWT_SECRET = 'un-secreto-de-sesion-para-las-pruebas';

const editEnv = (): Env => envWithSecrets({ JWT_SECRET });
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

  return app.request(`${BASE}${path}`, init, editEnv());
}

async function errorCode(response: Response): Promise<string> {
  return apiErrorSchema.parse(await response.json()).error.code;
}

describe('corregir y borrar una serie', () => {
  let db: Database;
  let token: string;
  let otherToken: string;
  let exerciseId: string;
  let sessionId: string;

  beforeEach(async () => {
    const seeded = await seedUsers(env.DB);
    db = seeded.db;
    token = await bearer(seeded.userId);
    otherToken = await bearer(seeded.otherUserId);

    exerciseId = uuid();
    sessionId = uuid();
    await call({
      method: 'POST',
      path: '/exercises',
      token,
      body: { id: exerciseId, origin: 'custom', name: 'Press de banca', bodyPart: 'chest' },
    });
    await call({
      method: 'POST',
      path: '/sessions',
      token,
      body: { id: sessionId },
    });
  });

  /** Registra una serie y devuelve su identificador, que es el que pone el cliente. */
  async function logSet(weight: string, reps: number, isWarmup = false): Promise<string> {
    const setId = uuid();
    const response = await call({
      method: 'POST',
      path: `/sessions/${sessionId}/sets`,
      token,
      body: { id: setId, trackedExerciseId: exerciseId, weight, reps, isWarmup },
    });

    expect(response.status).toBe(201);

    return setId;
  }

  async function currentRecords(): Promise<Record<string, string>> {
    const response = await call({ method: 'GET', path: `/stats/exercise/${exerciseId}`, token });
    const stats = exerciseStatsSchema.parse(await response.json());

    return Object.fromEntries(stats.records.map((record) => [record.kind, record.value]));
  }

  it('corrige el peso mal tecleado y deja la serie con lo nuevo', async () => {
    const setId = await logSet('180.00', 8);

    const corrected = await call({
      method: 'PATCH',
      path: `/sessions/${sessionId}/sets/${setId}`,
      token,
      body: { weight: '80.00' },
    });

    expect(corrected.status).toBe(200);
    const { set } = logSetResponseSchema.parse(await corrected.json());
    expect(set.weight).toBe('80.00');
    // Lo que no se toca se queda: la corrección es parcial, no un reemplazo de la serie.
    expect(set.reps).toBe(8);

    const detail = await call({ method: 'GET', path: `/sessions/${sessionId}`, token });
    const sets = workoutSessionDetailSchema.parse(await detail.json()).sets;
    expect(sets).toHaveLength(1);
    expect(sets[0]?.weight).toBe('80.00');
  });

  it('cambia las repeticiones, el rpe y el calentamiento por separado', async () => {
    const setId = await logSet('80.00', 8);

    const corrected = await call({
      method: 'PATCH',
      path: `/sessions/${sessionId}/sets/${setId}`,
      token,
      body: { reps: 6, rpe: 9, isWarmup: true },
    });

    const { set } = logSetResponseSchema.parse(await corrected.json());
    expect(set.reps).toBe(6);
    expect(set.rpe).toBe(9);
    expect(set.isWarmup).toBe(true);
    expect(set.weight).toBe('80.00');
  });

  it('quita un rpe anotado por error', async () => {
    const setId = uuid();
    await call({
      method: 'POST',
      path: `/sessions/${sessionId}/sets`,
      token,
      body: {
        id: setId,
        trackedExerciseId: exerciseId,
        weight: '80.00',
        reps: 8,
        rpe: 8.5,
      },
    });

    const corrected = await call({
      method: 'PATCH',
      path: `/sessions/${sessionId}/sets/${setId}`,
      token,
      body: { rpe: null },
    });

    expect(logSetResponseSchema.parse(await corrected.json()).set.rpe).toBeNull();
  });

  it('una corrección vacía devuelve la serie sin tocar nada', async () => {
    const setId = await logSet('80.00', 8);

    const corrected = await call({
      method: 'PATCH',
      path: `/sessions/${sessionId}/sets/${setId}`,
      token,
      body: {},
    });

    const { set, records } = logSetResponseSchema.parse(await corrected.json());
    expect(set.weight).toBe('80.00');
    expect(records).toEqual([]);
  });

  it('retira la marca que puso una serie corregida a la baja', async () => {
    const setId = await logSet('180.00', 8);
    expect((await currentRecords()).max_weight).toBe('180.00');

    await call({
      method: 'PATCH',
      path: `/sessions/${sessionId}/sets/${setId}`,
      token,
      body: { weight: '80.00' },
    });

    // La marca de 180 kg era un error de tecleo: corregida la serie, no puede sobrevivirla.
    expect((await currentRecords()).max_weight).toBe('80.00');
  });

  it('corregir al alza bate un récord y lo devuelve para celebrarlo', async () => {
    await logSet('80.00', 8);
    const setId = await logSet('82.50', 8);

    const corrected = await call({
      method: 'PATCH',
      path: `/sessions/${sessionId}/sets/${setId}`,
      token,
      body: { weight: '100.00' },
    });

    const { records } = logSetResponseSchema.parse(await corrected.json());
    expect(records.map((record) => record.kind).sort()).toEqual([
      'estimated_1rm',
      'max_volume',
      'max_weight',
    ]);
    expect((await currentRecords()).max_weight).toBe('100.00');
  });

  it('la marca vuelve a la mejor serie que queda cuando se corrige la que la tenía', async () => {
    await logSet('100.00', 8);
    const setId = await logSet('120.00', 8);
    expect((await currentRecords()).max_weight).toBe('120.00');

    await call({
      method: 'PATCH',
      path: `/sessions/${sessionId}/sets/${setId}`,
      token,
      body: { weight: '90.00' },
    });

    // Nadie superó los 100 kg de la primera serie: la marca es suya otra vez.
    expect((await currentRecords()).max_weight).toBe('100.00');
  });

  it('marcar una serie como calentamiento le quita las marcas que había puesto', async () => {
    const setId = await logSet('120.00', 8);
    expect((await currentRecords()).max_weight).toBe('120.00');

    await call({
      method: 'PATCH',
      path: `/sessions/${sessionId}/sets/${setId}`,
      token,
      body: { isWarmup: true },
    });

    // El calentamiento nunca marca: dejar la marca convertiría la corrección en un adorno.
    expect(await currentRecords()).toEqual({});
  });

  it('borra la serie y se lleva sus marcas por delante', async () => {
    const setId = await logSet('120.00', 8);
    expect((await currentRecords()).max_weight).toBe('120.00');

    const removed = await call({
      method: 'DELETE',
      path: `/sessions/${sessionId}/sets/${setId}`,
      token,
    });

    expect(removed.status).toBe(204);
    expect(await removed.text()).toBe('');

    const detail = await call({ method: 'GET', path: `/sessions/${sessionId}`, token });
    expect(workoutSessionDetailSchema.parse(await detail.json()).sets).toEqual([]);
    // La clave ajena es `on delete cascade`: sin la serie no queda marca que la respalde.
    expect(await db.select().from(personalRecord)).toEqual([]);
  });

  it('borrar una serie que ya no está responde igual: la cola offline reintenta', async () => {
    const setId = await logSet('80.00', 8);

    const first = await call({
      method: 'DELETE',
      path: `/sessions/${sessionId}/sets/${setId}`,
      token,
    });
    const second = await call({
      method: 'DELETE',
      path: `/sessions/${sessionId}/sets/${setId}`,
      token,
    });

    expect(first.status).toBe(204);
    expect(second.status).toBe(204);
  });

  it('deja hueco en el orden al borrar y sigue numerando por encima', async () => {
    const first = await logSet('80.00', 8);
    await logSet('82.50', 8);

    await call({ method: 'DELETE', path: `/sessions/${sessionId}/sets/${first}`, token });
    await logSet('85.00', 8);

    const detail = await call({ method: 'GET', path: `/sessions/${sessionId}`, token });
    const sets = workoutSessionDetailSchema.parse(await detail.json()).sets;
    // Renumerar el resto convertiría un borrado en una reescritura de la sesión entera.
    expect(sets.map((set) => set.orderIndex)).toEqual([1, 2]);
  });

  it('no toca las series de una sesión ya cerrada', async () => {
    const setId = await logSet('80.00', 8);
    await call({ method: 'POST', path: `/sessions/${sessionId}/end`, token, body: {} });

    const corrected = await call({
      method: 'PATCH',
      path: `/sessions/${sessionId}/sets/${setId}`,
      token,
      body: { weight: '85.00' },
    });
    const removed = await call({
      method: 'DELETE',
      path: `/sessions/${sessionId}/sets/${setId}`,
      token,
    });

    expect(corrected.status).toBe(409);
    expect(await errorCode(corrected)).toBe('session_closed');
    expect(removed.status).toBe(409);
    expect(await errorCode(removed)).toBe('session_closed');
  });

  it('responde 404 al corregir una serie que no está en esa sesión', async () => {
    const response = await call({
      method: 'PATCH',
      path: `/sessions/${sessionId}/sets/${uuid()}`,
      token,
      body: { weight: '85.00' },
    });

    expect(response.status).toBe(404);
    expect(await errorCode(response)).toBe('not_found');
  });

  it('deja al usuario de al lado fuera de las series ajenas', async () => {
    const setId = await logSet('80.00', 8);

    const corrected = await call({
      method: 'PATCH',
      path: `/sessions/${sessionId}/sets/${setId}`,
      token: otherToken,
      body: { weight: '5.00' },
    });
    const removed = await call({
      method: 'DELETE',
      path: `/sessions/${sessionId}/sets/${setId}`,
      token: otherToken,
    });

    // 404 y no 403: confirmar que la sesión existe ya sería contar algo de otro.
    expect(corrected.status).toBe(404);
    expect(removed.status).toBe(404);

    const detail = await call({ method: 'GET', path: `/sessions/${sessionId}`, token });
    expect(workoutSessionDetailSchema.parse(await detail.json()).sets[0]?.weight).toBe('80.00');
  });

  it('rechaza un peso imposible al corregir, con el contrato de error', async () => {
    const setId = await logSet('80.00', 8);

    const response = await call({
      method: 'PATCH',
      path: `/sessions/${sessionId}/sets/${setId}`,
      token,
      body: { weight: '80.5' },
    });

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe('validation_failed');
  });

  it('exige sesión para corregir y para borrar', async () => {
    const setId = await logSet('80.00', 8);
    const path = `${BASE}/sessions/${sessionId}/sets/${setId}`;

    for (const method of ['PATCH', 'DELETE']) {
      const response = await app.request(path, { method }, editEnv());

      expect(response.status).toBe(401);
      expect(await errorCode(response)).toBe('unauthorized');
    }
  });
});
