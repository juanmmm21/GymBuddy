import {
  activeSessionResponseSchema,
  apiErrorSchema,
  setEntrySchema,
  trackedExerciseSchema,
  workoutSessionDetailSchema,
} from '@gymbuddy/shared';
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { issueSessionToken } from '../src/auth/jwt';
import type { Database } from '../src/db/client';
import { app } from '../src/index';
import { seedCatalogSnapshot } from './catalog-fixtures';
import { seedUsers } from './fixtures';
import { envWithSecrets } from './worker-env';

const BASE = 'https://gymbuddy.test/api/v1';
const JWT_SECRET = 'un-secreto-de-sesion-para-las-pruebas';
const BENCH_CATALOG_ID = 'pectorals/barbell-bench-press';

const trainingEnv = (): Env => envWithSecrets({ JWT_SECRET });

/** El id lo pone el cliente, así que los tests lo hacen igual que lo hará la PWA. */
const uuid = (): string => crypto.randomUUID();

async function bearer(userId: string): Promise<string> {
  const { token } = await issueSessionToken(userId, JWT_SECRET, new Date());

  return `Bearer ${token}`;
}

interface Call {
  readonly method: 'GET' | 'POST' | 'PATCH';
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

  return app.request(`${BASE}${path}`, init, trainingEnv());
}

async function errorCode(response: Response): Promise<string> {
  return apiErrorSchema.parse(await response.json()).error.code;
}

describe('api de entrenamiento', () => {
  let db: Database;
  let token: string;
  let otherToken: string;

  beforeEach(async () => {
    const seeded = await seedUsers(env.DB);
    db = seeded.db;
    await seedCatalogSnapshot(db);
    token = await bearer(seeded.userId);
    otherToken = await bearer(seeded.otherUserId);
  });

  it('recorre el flujo completo: alta, sesión, tres series, cierre e historial', async () => {
    const exerciseId = uuid();
    const created = await call({
      method: 'POST',
      path: '/exercises',
      token,
      body: { id: exerciseId, origin: 'catalog', catalogId: BENCH_CATALOG_ID },
    });

    expect(created.status).toBe(201);
    const exercise = trackedExerciseSchema.parse(await created.json());
    // El nombre y el GIF salen del catálogo en el idioma del perfil, no se copian al alta.
    expect(exercise.name).toBe('Press de banca con barra');
    expect(exercise.bodyPart).toBe('chest');
    expect(exercise.lastSet).toBeNull();

    const sessionId = uuid();
    const opened = await call({
      method: 'POST',
      path: '/sessions',
      token,
      body: { id: sessionId, source: 'web' },
    });

    expect(opened.status).toBe(201);
    expect(workoutSessionDetailSchema.parse(await opened.json()).sets).toEqual([]);

    const weights = ['60.00', '82.50', '82.50'];
    for (const [index, weight] of weights.entries()) {
      const logged = await call({
        method: 'POST',
        path: `/sessions/${sessionId}/sets`,
        token,
        body: {
          id: uuid(),
          trackedExerciseId: exerciseId,
          weight,
          reps: index === 0 ? 10 : 8,
          isWarmup: index === 0,
          source: 'web',
        },
      });

      expect(logged.status).toBe(201);
      const set = setEntrySchema.parse(await logged.json());
      // El orden lo pone el servidor: la PWA no sabe cuántas series lleva el bot metidas.
      expect(set.orderIndex).toBe(index);
      expect(set.weight).toBe(weight);
    }

    const active = await call({ method: 'GET', path: '/sessions/active', token });
    const activeBody = activeSessionResponseSchema.parse(await active.json());
    expect(activeBody.session?.id).toBe(sessionId);
    expect(activeBody.session?.sets).toHaveLength(3);

    const ended = await call({
      method: 'POST',
      path: `/sessions/${sessionId}/end`,
      token,
      body: { notes: 'Buena sesión' },
    });

    const closed = workoutSessionDetailSchema.parse(await ended.json());
    expect(closed.endedAt).not.toBeNull();
    expect(closed.notes).toBe('Buena sesión');

    const afterClosing = await call({ method: 'GET', path: '/sessions/active', token });
    expect(activeSessionResponseSchema.parse(await afterClosing.json()).session).toBeNull();

    // La ficha ya precarga el peso de la última serie efectiva; el calentamiento no cuenta.
    const listed = await call({ method: 'GET', path: '/exercises', token });
    const [tracked] = trackedExerciseSchema.array().parse(await listed.json());
    expect(tracked?.lastSet?.weight).toBe('82.50');
    expect(tracked?.lastSet?.reps).toBe(8);
  });

  it('registrar dos veces la misma serie no la duplica', async () => {
    const { exerciseId, sessionId } = await openSessionWith(token);
    const setId = uuid();
    const body = {
      id: setId,
      trackedExerciseId: exerciseId,
      weight: '80.00',
      reps: 8,
      completedAt: '2026-09-08T18:30:00.000Z',
      source: 'web',
    };

    const first = await call({
      method: 'POST',
      path: `/sessions/${sessionId}/sets`,
      token,
      body,
    });
    const second = await call({
      method: 'POST',
      path: `/sessions/${sessionId}/sets`,
      token,
      body,
    });

    expect(first.status).toBe(201);
    // 200 y no 201: el reenvío de la cola offline no crea nada nuevo.
    expect(second.status).toBe(200);
    expect(setEntrySchema.parse(await second.json()).id).toBe(setId);

    const detail = await call({ method: 'GET', path: `/sessions/${sessionId}`, token });
    expect(workoutSessionDetailSchema.parse(await detail.json()).sets).toHaveLength(1);
  });

  it('rechaza reutilizar el identificador de una serie con otros datos', async () => {
    const { exerciseId, sessionId } = await openSessionWith(token);
    const setId = uuid();
    const body = {
      id: setId,
      trackedExerciseId: exerciseId,
      weight: '80.00',
      reps: 8,
      source: 'web',
    };

    await call({ method: 'POST', path: `/sessions/${sessionId}/sets`, token, body });
    const conflict = await call({
      method: 'POST',
      path: `/sessions/${sessionId}/sets`,
      token,
      body: { ...body, weight: '100.00' },
    });

    expect(conflict.status).toBe(409);
    expect(await errorCode(conflict)).toBe('conflicting_write');
  });

  it('no deja abrir una segunda sesión mientras hay una sin cerrar', async () => {
    const { sessionId } = await openSessionWith(token);

    const second = await call({
      method: 'POST',
      path: '/sessions',
      token,
      body: { id: uuid(), source: 'bot' },
    });

    expect(second.status).toBe(409);
    expect(await errorCode(second)).toBe('session_already_open');

    // Reabrir la misma es idempotente: es lo que hace la cola offline al recuperar red.
    const again = await call({
      method: 'POST',
      path: '/sessions',
      token,
      body: { id: sessionId, source: 'web' },
    });
    expect(again.status).toBe(200);
  });

  it('no admite series en una sesión ya cerrada', async () => {
    const { exerciseId, sessionId } = await openSessionWith(token);
    await call({ method: 'POST', path: `/sessions/${sessionId}/end`, token, body: {} });

    const late = await call({
      method: 'POST',
      path: `/sessions/${sessionId}/sets`,
      token,
      body: { id: uuid(), trackedExerciseId: exerciseId, weight: '80.00', reps: 8, source: 'web' },
    });

    expect(late.status).toBe(409);
    expect(await errorCode(late)).toBe('session_closed');
  });

  it('cerrar dos veces la misma sesión no mueve la hora de cierre', async () => {
    const { sessionId } = await openSessionWith(token);

    const first = await call({
      method: 'POST',
      path: `/sessions/${sessionId}/end`,
      token,
      body: { endedAt: '2026-09-08T19:00:00.000Z' },
    });
    const second = await call({
      method: 'POST',
      path: `/sessions/${sessionId}/end`,
      token,
      body: { endedAt: '2026-09-08T20:00:00.000Z' },
    });

    expect(workoutSessionDetailSchema.parse(await first.json()).endedAt).toBe(
      '2026-09-08T19:00:00.000Z',
    );
    expect(workoutSessionDetailSchema.parse(await second.json()).endedAt).toBe(
      '2026-09-08T19:00:00.000Z',
    );
  });

  it('no deja seguir dos veces el mismo ejercicio del catálogo', async () => {
    await call({
      method: 'POST',
      path: '/exercises',
      token,
      body: { id: uuid(), origin: 'catalog', catalogId: BENCH_CATALOG_ID },
    });

    const duplicate = await call({
      method: 'POST',
      path: '/exercises',
      token,
      body: { id: uuid(), origin: 'catalog', catalogId: BENCH_CATALOG_ID },
    });

    expect(duplicate.status).toBe(409);
    expect(await errorCode(duplicate)).toBe('exercise_already_tracked');
  });

  it('rechaza un ejercicio del catálogo que no existe en el snapshot', async () => {
    const response = await call({
      method: 'POST',
      path: '/exercises',
      token,
      body: { id: uuid(), origin: 'catalog', catalogId: 'pectorals/no-existe' },
    });

    expect(response.status).toBe(404);
    expect(await errorCode(response)).toBe('not_found');
  });

  it('archiva un ejercicio sin borrar su historial y lo saca del listado', async () => {
    const { exerciseId, sessionId } = await openSessionWith(token);
    await call({
      method: 'POST',
      path: `/sessions/${sessionId}/sets`,
      token,
      body: { id: uuid(), trackedExerciseId: exerciseId, weight: '80.00', reps: 8, source: 'web' },
    });

    const archived = await call({
      method: 'PATCH',
      path: `/exercises/${exerciseId}`,
      token,
      body: { archived: true, notes: 'Lo dejo por el hombro' },
    });

    const body = trackedExerciseSchema.parse(await archived.json());
    expect(body.archivedAt).not.toBeNull();
    expect(body.notes).toBe('Lo dejo por el hombro');
    // Su serie sigue ahí: archivar es una baja blanda, no un borrado.
    expect(body.lastSet?.weight).toBe('80.00');

    const listed = await call({ method: 'GET', path: '/exercises', token });
    expect(trackedExerciseSchema.array().parse(await listed.json())).toHaveLength(0);

    const withArchived = await call({
      method: 'GET',
      path: '/exercises?includeArchived=true',
      token,
    });
    expect(trackedExerciseSchema.array().parse(await withArchived.json())).toHaveLength(1);
  });

  it('sirve el nombre del catálogo en el idioma que se pida', async () => {
    const exerciseId = uuid();
    await call({
      method: 'POST',
      path: '/exercises',
      token,
      body: { id: exerciseId, origin: 'catalog', catalogId: BENCH_CATALOG_ID },
    });

    const english = await call({ method: 'GET', path: `/exercises/${exerciseId}?lang=en`, token });

    expect(trackedExerciseSchema.parse(await english.json()).name).toBe('Barbell Bench Press');
  });

  it('deja al usuario de al lado fuera de lo tuyo', async () => {
    const { exerciseId, sessionId } = await openSessionWith(token);

    const foreignSession = await call({
      method: 'GET',
      path: `/sessions/${sessionId}`,
      token: otherToken,
    });
    const foreignExercise = await call({
      method: 'GET',
      path: `/exercises/${exerciseId}`,
      token: otherToken,
    });
    const foreignSet = await call({
      method: 'POST',
      path: `/sessions/${sessionId}/sets`,
      token: otherToken,
      body: { id: uuid(), trackedExerciseId: exerciseId, weight: '80.00', reps: 8, source: 'web' },
    });

    // 404 y no 403: confirmar que el recurso existe ya sería contar algo de otro.
    expect(foreignSession.status).toBe(404);
    expect(foreignExercise.status).toBe(404);
    expect(foreignSet.status).toBe(404);
  });

  it('exige sesión en todas las rutas de entrenamiento', async () => {
    for (const path of ['/exercises', '/sessions/active', '/history/sessions']) {
      const response = await app.request(`${BASE}${path}`, {}, trainingEnv());

      expect(response.status).toBe(401);
      expect(await errorCode(response)).toBe('unauthorized');
    }
  });

  it('rechaza un cuerpo sin identificador de cliente', async () => {
    const response = await call({
      method: 'POST',
      path: '/sessions',
      token,
      body: { source: 'web' },
    });

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe('validation_failed');
  });

  /** Un ejercicio propio y una sesión abierta: el punto de partida de casi todos los casos. */
  async function openSessionWith(
    sessionToken: string,
  ): Promise<{ exerciseId: string; sessionId: string }> {
    const exerciseId = uuid();
    const sessionId = uuid();

    await call({
      method: 'POST',
      path: '/exercises',
      token: sessionToken,
      body: { id: exerciseId, origin: 'custom', name: 'Press de banca', bodyPart: 'chest' },
    });
    await call({
      method: 'POST',
      path: '/sessions',
      token: sessionToken,
      body: { id: sessionId, source: 'web' },
    });

    return { exerciseId, sessionId };
  }
});
