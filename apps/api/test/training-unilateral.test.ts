import {
  exerciseStatsSchema,
  exportSnapshotSchema,
  logSetResponseSchema,
  trackedExerciseSchema,
  type PersonalRecord,
} from '@gymbuddy/shared';
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { issueSessionToken } from '../src/auth/jwt';
import { app } from '../src/index';
import { seedCatalogSnapshot } from './catalog-fixtures';
import { seedUsers } from './fixtures';
import { envWithSecrets } from './worker-env';

const BASE = 'https://gymbuddy.test/api/v1';
const JWT_SECRET = 'un-secreto-de-sesion-para-las-pruebas';
const BENCH_CATALOG_ID = 'pectorals/barbell-bench-press';

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

  return app.request(`${BASE}${path}`, init, envWithSecrets({ JWT_SECRET }));
}

/** Las marcas como `tipo → valor`, que es lo que se compara en estos tests. */
function recordValues(records: readonly PersonalRecord[]): Record<string, string> {
  return Object.fromEntries(records.map((record) => [record.kind, record.value]));
}

describe('ejercicios a un brazo', () => {
  let token: string;
  let otherToken: string;

  beforeEach(async () => {
    const seeded = await seedUsers(env.DB);
    await seedCatalogSnapshot(seeded.db);
    token = await bearer(seeded.userId);
    otherToken = await bearer(seeded.otherUserId);
  });

  async function createRow(unilateral?: boolean): Promise<string> {
    const id = uuid();
    const response = await call({
      method: 'POST',
      path: '/exercises',
      token,
      body: {
        id,
        origin: 'custom',
        name: 'Remo con mancuerna',
        bodyPart: 'back',
        ...(unilateral === undefined ? {} : { unilateral }),
      },
    });
    expect(response.status).toBe(201);

    return id;
  }

  async function logSet(
    exerciseId: string,
    weight: string,
    reps: number,
  ): Promise<PersonalRecord[]> {
    const sessionId = uuid();
    expect(
      (await call({ method: 'POST', path: '/sessions', token, body: { id: sessionId } })).status,
    ).toBe(201);
    const logged = await call({
      method: 'POST',
      path: `/sessions/${sessionId}/sets`,
      token,
      body: { id: uuid(), trackedExerciseId: exerciseId, weight, reps },
    });
    expect(logged.status).toBe(201);
    const { records } = logSetResponseSchema.parse(await logged.json());
    await call({ method: 'POST', path: `/sessions/${sessionId}/end`, token, body: {} });

    return records;
  }

  async function setUnilateral(exerciseId: string, unilateral: boolean, as = token) {
    return call({
      method: 'PATCH',
      path: `/exercises/${exerciseId}`,
      token: as,
      body: { unilateral },
    });
  }

  async function statsOf(exerciseId: string) {
    const response = await call({ method: 'GET', path: `/stats/exercise/${exerciseId}`, token });
    expect(response.status).toBe(200);

    return exerciseStatsSchema.parse(await response.json());
  }

  it('un ejercicio nace a dos brazos salvo que se diga lo contrario', async () => {
    const catalog = await call({
      method: 'POST',
      path: '/exercises',
      token,
      body: { id: uuid(), origin: 'catalog', catalogId: BENCH_CATALOG_ID },
    });
    const oneArm = await call({
      method: 'GET',
      path: `/exercises/${await createRow(true)}`,
      token,
    });

    expect(trackedExerciseSchema.parse(await catalog.json()).unilateral).toBe(false);
    expect(trackedExerciseSchema.parse(await oneArm.json()).unilateral).toBe(true);
  });

  it('las marcas de peso y 1RM van por brazo y la de volumen cuenta los dos lados', async () => {
    const exerciseId = await createRow(true);

    const records = await logSet(exerciseId, '20.00', 10);

    expect(recordValues(records)).toStrictEqual({
      max_weight: '20.00',
      estimated_1rm: '26.67',
      max_volume: '400.00',
    });
    const stats = await statsOf(exerciseId);
    expect(stats.points.map((point) => [point.topWeight, point.volume])).toStrictEqual([
      ['20.00', '400.00'],
    ]);
    expect(stats.workingWeight?.weight).toBe('20.00');
  });

  it('con la marca de volumen guardada a dos lados, la siguiente serie se compara igual', async () => {
    const exerciseId = await createRow(true);
    await logSet(exerciseId, '20.00', 10);

    // 22 kg × 9 por brazo son 396 kg: sube el peso y el 1RM, pero no mueve más que los 400 kg.
    const records = await logSet(exerciseId, '22.00', 9);

    expect(recordValues(records)).toStrictEqual({ max_weight: '22.00', estimated_1rm: '28.60' });
  });

  it('marcarlo o desmarcarlo después reescala su marca de volumen y su gráfica', async () => {
    const exerciseId = await createRow();
    await logSet(exerciseId, '20.00', 10);
    expect(recordValues((await statsOf(exerciseId)).records).max_volume).toBe('200.00');

    const marked = await setUnilateral(exerciseId, true);
    expect(marked.status).toBe(200);
    expect(trackedExerciseSchema.parse(await marked.json()).unilateral).toBe(true);
    let stats = await statsOf(exerciseId);
    expect(recordValues(stats.records)).toStrictEqual({
      max_weight: '20.00',
      estimated_1rm: '26.67',
      max_volume: '400.00',
    });
    expect(stats.points[0]?.volume).toBe('400.00');

    const unmarked = await setUnilateral(exerciseId, false);
    expect(unmarked.status).toBe(200);
    stats = await statsOf(exerciseId);
    expect(recordValues(stats.records).max_volume).toBe('200.00');
    expect(stats.points[0]?.volume).toBe('200.00');
  });

  it('pedir dos veces lo mismo, como hace un reenvío, no reescala dos veces', async () => {
    const exerciseId = await createRow();
    await logSet(exerciseId, '20.00', 10);

    await setUnilateral(exerciseId, true);
    await setUnilateral(exerciseId, true);
    expect(recordValues((await statsOf(exerciseId)).records).max_volume).toBe('400.00');

    await setUnilateral(exerciseId, false);
    await setUnilateral(exerciseId, false);
    expect(recordValues((await statsOf(exerciseId)).records).max_volume).toBe('200.00');
  });

  it('el usuario de al lado no puede marcar un ejercicio tuyo ni tocar sus marcas', async () => {
    const exerciseId = await createRow();
    await logSet(exerciseId, '20.00', 10);

    const response = await setUnilateral(exerciseId, true, otherToken);

    expect(response.status).toBe(404);
    expect(recordValues((await statsOf(exerciseId)).records).max_volume).toBe('200.00');
  });

  it('borrar la serie de la marca la reconstruye contando los dos lados', async () => {
    const exerciseId = await createRow(true);
    await logSet(exerciseId, '20.00', 8);
    const sessionId = uuid();
    await call({ method: 'POST', path: '/sessions', token, body: { id: sessionId } });
    await call({
      method: 'POST',
      path: `/sessions/${sessionId}/sets`,
      token,
      body: { id: uuid(), trackedExerciseId: exerciseId, weight: '20.00', reps: 12 },
    });
    await call({ method: 'POST', path: `/sessions/${sessionId}/end`, token, body: {} });

    expect((await call({ method: 'DELETE', path: `/sessions/${sessionId}`, token })).status).toBe(
      204,
    );

    expect(recordValues((await statsOf(exerciseId)).records).max_volume).toBe('320.00');
  });

  it('la copia de seguridad dice qué ejercicios son a un brazo', async () => {
    const oneArm = await createRow(true);
    const twoArms = await createRow(false);

    const response = await call({ method: 'GET', path: '/export/snapshot', token });
    const snapshot = exportSnapshotSchema.parse(await response.json());

    expect(
      Object.fromEntries(snapshot.exercises.map((exercise) => [exercise.id, exercise.unilateral])),
    ).toStrictEqual({ [oneArm]: true, [twoArms]: false });
  });
});
