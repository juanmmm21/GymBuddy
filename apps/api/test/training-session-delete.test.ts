import {
  activeSessionResponseSchema,
  apiErrorSchema,
  exerciseStatsSchema,
  logSetResponseSchema,
  readSessionRefresh,
  workoutSessionPageSchema,
  type PersonalRecord,
} from '@gymbuddy/shared';
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { issueSessionToken } from '../src/auth/jwt';
import type { Database } from '../src/db/client';
import { personalRecord, setEntry, workoutSession } from '../src/db/schema';
import { app } from '../src/index';
import { seedUsers } from './fixtures';
import { envWithSecrets } from './worker-env';

const BASE = 'https://gymbuddy.test/api/v1';
const JWT_SECRET = 'un-secreto-de-sesion-para-las-pruebas';

const uuid = (): string => crypto.randomUUID();

/** Días atrás respecto al reloj real, a las 18:00 UTC: lejos de la regla de inactividad. */
const daysAgoAt = (days: number, minutes = 0): string => {
  const day = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  day.setUTCHours(18, minutes, 0, 0);
  return day.toISOString();
};

interface Call {
  readonly method: 'GET' | 'POST' | 'DELETE';
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

async function bearer(userId: string, at = new Date()): Promise<string> {
  return `Bearer ${(await issueSessionToken(userId, JWT_SECRET, at)).token}`;
}

interface LoggedSet {
  readonly weight: string;
  readonly reps: number;
  readonly isWarmup?: boolean;
}

describe('borrar un entrenamiento', () => {
  let db: Database;
  let userId: string;
  let token: string;
  let otherToken: string;
  let exerciseId: string;

  beforeEach(async () => {
    const seeded = await seedUsers(env.DB);
    db = seeded.db;
    userId = seeded.userId;
    token = await bearer(seeded.userId);
    otherToken = await bearer(seeded.otherUserId);

    exerciseId = uuid();
    await call({
      method: 'POST',
      path: '/exercises',
      token,
      body: { id: exerciseId, origin: 'custom', name: 'Press de banca', bodyPart: 'chest' },
    });
  });

  /**
   * Un entrenamiento de hace `days` días, ya cerrado, con sus series un minuto detrás de otra.
   * Devuelve el id de la sesión y los de sus series, en el orden en que se registraron.
   */
  async function trainDaysAgo(
    days: number,
    sets: readonly LoggedSet[],
  ): Promise<{ sessionId: string; setIds: string[] }> {
    const sessionId = uuid();
    const opened = await call({
      method: 'POST',
      path: '/sessions',
      token,
      body: { id: sessionId, startedAt: daysAgoAt(days) },
    });
    expect(opened.status).toBe(201);

    const setIds: string[] = [];
    for (const [index, set] of sets.entries()) {
      const setId = uuid();
      const logged = await call({
        method: 'POST',
        path: `/sessions/${sessionId}/sets`,
        token,
        body: {
          id: setId,
          trackedExerciseId: exerciseId,
          weight: set.weight,
          reps: set.reps,
          isWarmup: set.isWarmup ?? false,
          completedAt: daysAgoAt(days, index + 1),
        },
      });
      expect(logged.status).toBe(201);
      setIds.push(setId);
    }

    await call({
      method: 'POST',
      path: `/sessions/${sessionId}/end`,
      token,
      body: { endedAt: daysAgoAt(days, sets.length + 1) },
    });

    return { sessionId, setIds };
  }

  const deleteSession = (sessionId: string, as = token): Promise<Response> =>
    call({ method: 'DELETE', path: `/sessions/${sessionId}`, token: as });

  async function currentRecords(): Promise<Map<string, PersonalRecord>> {
    const response = await call({ method: 'GET', path: `/stats/exercise/${exerciseId}`, token });
    const stats = exerciseStatsSchema.parse(await response.json());

    return new Map(stats.records.map((record) => [record.kind, record]));
  }

  it('borra la sesión con sus series y responde 204 sin cuerpo', async () => {
    const { sessionId } = await trainDaysAgo(3, [{ weight: '80.00', reps: 8 }]);

    const removed = await deleteSession(sessionId);

    expect(removed.status).toBe(204);
    expect(await removed.text()).toBe('');
    expect((await call({ method: 'GET', path: `/sessions/${sessionId}`, token })).status).toBe(404);
    const history = workoutSessionPageSchema.parse(
      await (await call({ method: 'GET', path: '/history/sessions', token })).json(),
    );
    expect(history.items.map((session) => session.id)).not.toContain(sessionId);
    // La clave ajena es `on delete cascade` y D1 la aplica: no quedan series ni marcas huérfanas.
    expect(await db.select().from(setEntry)).toEqual([]);
    expect(await db.select().from(personalRecord)).toEqual([]);
  });

  it('borrar dos veces, o una sesión que no existe, responde igual', async () => {
    const { sessionId } = await trainDaysAgo(3, [{ weight: '80.00', reps: 8 }]);

    expect((await deleteSession(sessionId)).status).toBe(204);
    expect((await deleteSession(sessionId)).status).toBe(204);
    expect((await deleteSession(uuid())).status).toBe(204);
  });

  it('no toca la sesión de otro aunque le responda lo mismo', async () => {
    const { sessionId } = await trainDaysAgo(3, [{ weight: '80.00', reps: 8 }]);

    // 204 y no 404: ni se borra ni se confirma a nadie que ese identificador existe.
    expect((await deleteSession(sessionId, otherToken)).status).toBe(204);

    expect((await call({ method: 'GET', path: `/sessions/${sessionId}`, token })).status).toBe(200);
  });

  it('exige sesión para borrar', async () => {
    const response = await app.request(
      `${BASE}/sessions/${uuid()}`,
      { method: 'DELETE' },
      envWithSecrets({ JWT_SECRET }),
    );

    expect(response.status).toBe(401);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe('unauthorized');
  });

  it('renueva la sesión también en el 204', async () => {
    const { sessionId } = await trainDaysAgo(3, [{ weight: '80.00', reps: 8 }]);
    const stale = await bearer(userId, new Date(Date.now() - 20 * 24 * 60 * 60 * 1000));

    const removed = await deleteSession(sessionId, stale);

    expect(removed.status).toBe(204);
    expect(readSessionRefresh(removed.headers)).not.toBeNull();
  });

  it('la siguiente mejor serie que vino después hereda la marca del entrenamiento borrado', async () => {
    await trainDaysAgo(9, [{ weight: '100.00', reps: 5 }]);
    const { sessionId } = await trainDaysAgo(6, [{ weight: '120.00', reps: 5 }]);
    const { setIds: after } = await trainDaysAgo(3, [{ weight: '110.00', reps: 5 }]);
    expect((await currentRecords()).get('max_weight')?.value).toBe('120.00');

    await deleteSession(sessionId);

    // Sin los 120 kg, los 110 kg de hace tres días superaban los 100 kg: el récord es suyo.
    const records = await currentRecords();
    expect(records.get('max_weight')?.value).toBe('110.00');
    expect(records.get('max_weight')?.setEntryId).toBe(after[0]);
    expect(records.get('estimated_1rm')?.setEntryId).toBe(after[0]);
    expect(records.get('max_volume')?.setEntryId).toBe(after[0]);
  });

  it('las marcas anteriores al entrenamiento borrado se quedan como estaban', async () => {
    await trainDaysAgo(9, [{ weight: '100.00', reps: 5 }]);
    const before = await db.select().from(personalRecord);
    const { sessionId } = await trainDaysAgo(6, [{ weight: '90.00', reps: 5 }]);

    await deleteSession(sessionId);

    expect(await db.select().from(personalRecord)).toEqual(before);
  });

  it('no duplica una marca que sigue siendo de una serie posterior', async () => {
    await trainDaysAgo(9, [{ weight: '100.00', reps: 5 }]);
    const { sessionId } = await trainDaysAgo(6, [{ weight: '80.00', reps: 5 }]);
    await trainDaysAgo(3, [{ weight: '130.00', reps: 5 }]);

    await deleteSession(sessionId);

    const rows = await db.select().from(personalRecord);
    // Tres del primer día y tres de los 130 kg: los 80 kg nunca marcaron.
    expect(rows).toHaveLength(6);
    expect((await currentRecords()).get('max_weight')?.value).toBe('130.00');
  });

  it('un entrenamiento de solo calentamiento se borra sin reescribir ninguna marca', async () => {
    await trainDaysAgo(9, [{ weight: '100.00', reps: 5 }]);
    const before = await db.select().from(personalRecord);
    const { sessionId } = await trainDaysAgo(6, [{ weight: '60.00', reps: 10, isWarmup: true }]);

    await deleteSession(sessionId);

    expect(await db.select().from(personalRecord)).toEqual(before);
  });

  it('borra la sesión abierta y deja empezar otra', async () => {
    const sessionId = uuid();
    await call({ method: 'POST', path: '/sessions', token, body: { id: sessionId } });

    expect((await deleteSession(sessionId)).status).toBe(204);

    const active = activeSessionResponseSchema.parse(
      await (await call({ method: 'GET', path: '/sessions/active', token })).json(),
    );
    expect(active.session).toBeNull();
    const next = await call({ method: 'POST', path: '/sessions', token, body: { id: uuid() } });
    expect(next.status).toBe(201);
  });

  it('lo que llega de la cola para una sesión ya borrada se rechaza con not_found', async () => {
    const sessionId = uuid();
    await call({ method: 'POST', path: '/sessions', token, body: { id: sessionId } });
    await deleteSession(sessionId);

    const logged = await call({
      method: 'POST',
      path: `/sessions/${sessionId}/sets`,
      token,
      body: { id: uuid(), trackedExerciseId: exerciseId, weight: '80.00', reps: 8 },
    });

    expect(logged.status).toBe(404);
    expect(apiErrorSchema.parse(await logged.json()).error.code).toBe('not_found');
    expect(await db.select().from(workoutSession)).toEqual([]);
  });
});

describe('borrar la serie que tenía la marca', () => {
  it('se la pasa a la siguiente mejor serie que vino detrás', async () => {
    const seeded = await seedUsers(env.DB);
    const token = await bearer(seeded.userId);
    const exerciseId = uuid();
    const sessionId = uuid();
    await call({
      method: 'POST',
      path: '/exercises',
      token,
      body: { id: exerciseId, origin: 'custom', name: 'Sentadilla', bodyPart: 'legs' },
    });
    await call({ method: 'POST', path: '/sessions', token, body: { id: sessionId } });

    const logSet = async (weight: string): Promise<string> => {
      const id = uuid();
      const response = await call({
        method: 'POST',
        path: `/sessions/${sessionId}/sets`,
        token,
        body: { id, trackedExerciseId: exerciseId, weight, reps: 5 },
      });
      logSetResponseSchema.parse(await response.json());
      return id;
    };

    await logSet('100.00');
    const heaviest = await logSet('120.00');
    const next = await logSet('110.00');

    const removed = await call({
      method: 'DELETE',
      path: `/sessions/${sessionId}/sets/${heaviest}`,
      token,
    });
    expect(removed.status).toBe(204);

    const stats = exerciseStatsSchema.parse(
      await (await call({ method: 'GET', path: `/stats/exercise/${exerciseId}`, token })).json(),
    );
    const maxWeight = stats.records.find((record) => record.kind === 'max_weight');
    expect(maxWeight?.value).toBe('110.00');
    expect(maxWeight?.setEntryId).toBe(next);
  });
});
