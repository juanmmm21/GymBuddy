import {
  CARDIO_IN_PROGRESS_LIMIT_MINUTES,
  activeSessionResponseSchema,
  apiErrorSchema,
  workoutSessionDetailSchema,
} from '@gymbuddy/shared';
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { issueSessionToken } from '../src/auth/jwt';
import { app } from '../src/index';
import { seedUsers } from './fixtures';
import { envWithSecrets } from './worker-env';

const BASE = 'https://gymbuddy.test/api/v1';
const JWT_SECRET = 'un-secreto-de-sesion-para-las-pruebas';

const uuid = (): string => crypto.randomUUID();

/** Las horas van respecto al reloj real: la regla compara con el instante de la petición. */
const minutesAgo = (minutes: number): string =>
  new Date(Date.now() - minutes * 60_000).toISOString();

interface Call {
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly path: string;
  readonly body?: unknown;
}

describe('cardio en marcha (revisión del ADR 0008)', () => {
  let token: string;
  let treadmillId: string;

  const call = async ({ method, path, body }: Call): Promise<Response> =>
    app.request(
      `${BASE}${path}`,
      body === undefined
        ? { method, headers: { authorization: token } }
        : {
            method,
            headers: { authorization: token, 'content-type': 'application/json' },
            body: JSON.stringify(body),
          },
      envWithSecrets({ JWT_SECRET }),
    );

  const openSession = async (startedAt: string): Promise<string> => {
    const id = uuid();
    const response = await call({ method: 'POST', path: '/sessions', body: { id, startedAt } });
    expect(response.status).toBe(201);
    return id;
  };

  const logStrength = (sessionId: string, completedAt: string): Promise<Response> =>
    call({
      method: 'POST',
      path: `/sessions/${sessionId}/sets`,
      body: { id: uuid(), trackedExerciseId: treadmillId, weight: '80.00', reps: 8, completedAt },
    });

  const logCardio = (
    sessionId: string,
    completedAt: string,
    durationMinutes: number,
  ): Promise<Response> =>
    call({
      method: 'POST',
      path: `/sessions/${sessionId}/sets`,
      body: {
        id: uuid(),
        trackedExerciseId: treadmillId,
        kind: 'cardio',
        durationSeconds: durationMinutes * 60,
        completedAt,
      },
    });

  const startCardio = (sessionId: string, startedAt: string): Promise<Response> =>
    call({ method: 'PUT', path: `/sessions/${sessionId}/cardio`, body: { startedAt } });

  const readSession = async (sessionId: string) =>
    workoutSessionDetailSchema.parse(
      await (await call({ method: 'GET', path: `/sessions/${sessionId}` })).json(),
    );

  const activeSession = async () =>
    activeSessionResponseSchema.parse(
      await (await call({ method: 'GET', path: '/sessions/active' })).json(),
    ).session;

  const errorCode = async (response: Response): Promise<string> =>
    apiErrorSchema.parse(await response.json()).error.code;

  beforeEach(async () => {
    const seeded = await seedUsers(env.DB);
    token = `Bearer ${(await issueSessionToken(seeded.userId, JWT_SECRET, new Date())).token}`;
    treadmillId = uuid();
    await call({
      method: 'POST',
      path: '/exercises',
      body: { id: treadmillId, origin: 'custom', name: 'Cinta', bodyPart: 'cardio' },
    });
  });

  it('con un cardio en marcha la sesión sigue abierta pasada la hora sin series', async () => {
    const cardioStartedAt = minutesAgo(80);
    const sessionId = await openSession(minutesAgo(100));
    expect((await logStrength(sessionId, minutesAgo(95))).status).toBe(201);

    const started = await startCardio(sessionId, cardioStartedAt);

    expect(started.status).toBe(200);
    expect(workoutSessionDetailSchema.parse(await started.json()).cardioStartedAt).toBe(
      cardioStartedAt,
    );
    const active = await activeSession();
    expect(active?.id).toBe(sessionId);
    expect(active?.cardioStartedAt).toBe(cardioStartedAt);
  });

  it('apuntar el cardio lo termina, y la sesión sigue abierta con él', async () => {
    const sessionId = await openSession(minutesAgo(100));
    expect((await logStrength(sessionId, minutesAgo(95))).status).toBe(201);
    expect((await startCardio(sessionId, minutesAgo(80))).status).toBe(200);

    expect((await logCardio(sessionId, minutesAgo(1), 79)).status).toBe(201);

    const active = await activeSession();
    expect(active?.id).toBe(sessionId);
    expect(active?.cardioStartedAt).toBeNull();
  });

  it('un cardio olvidado deja de contar a las tres horas y la sesión se cierra cuando empezó', async () => {
    const cardioStartedAt = minutesAgo(CARDIO_IN_PROGRESS_LIMIT_MINUTES + 10);
    const sessionId = await openSession(minutesAgo(300));
    expect((await logStrength(sessionId, minutesAgo(250))).status).toBe(201);
    expect((await logStrength(sessionId, minutesAgo(230))).status).toBe(201);
    expect((await startCardio(sessionId, cardioStartedAt)).status).toBe(200);

    expect(await activeSession()).toBeNull();
    const closed = await readSession(sessionId);
    expect(closed.endedAt).toBe(cardioStartedAt);
    expect(closed.cardioStartedAt).toBeNull();
  });

  it('cancelar el cardio lo quita y repetirlo responde igual', async () => {
    const sessionId = await openSession(minutesAgo(10));
    expect((await startCardio(sessionId, minutesAgo(5))).status).toBe(200);

    const first = await call({ method: 'DELETE', path: `/sessions/${sessionId}/cardio` });
    const again = await call({ method: 'DELETE', path: `/sessions/${sessionId}/cardio` });

    expect(first.status).toBe(204);
    expect(again.status).toBe(204);
    expect((await readSession(sessionId)).cardioStartedAt).toBeNull();
  });

  it('empezarlo otra vez mueve la hora; terminar la sesión lo quita', async () => {
    const sessionId = await openSession(minutesAgo(30));
    expect((await startCardio(sessionId, minutesAgo(20))).status).toBe(200);
    const moved = minutesAgo(10);
    expect((await startCardio(sessionId, moved)).status).toBe(200);
    expect((await readSession(sessionId)).cardioStartedAt).toBe(moved);

    const ended = await call({ method: 'POST', path: `/sessions/${sessionId}/end`, body: {} });

    expect(ended.status).toBe(200);
    expect(workoutSessionDetailSchema.parse(await ended.json()).cardioStartedAt).toBeNull();
  });

  it('una serie de cardio vieja que llega tarde de la cola no termina el que empezó después', async () => {
    const cardioStartedAt = minutesAgo(10);
    const sessionId = await openSession(minutesAgo(30));
    expect((await startCardio(sessionId, cardioStartedAt)).status).toBe(200);

    expect((await logCardio(sessionId, minutesAgo(20), 5)).status).toBe(201);

    expect((await readSession(sessionId)).cardioStartedAt).toBe(cardioStartedAt);
  });

  it('una serie de cardio de la cola reabre la sesión si empezó dentro del margen, aunque se apunte fuera', async () => {
    const sessionId = await openSession(minutesAgo(150));
    expect((await logStrength(sessionId, minutesAgo(140))).status).toBe(201);
    expect(await activeSession()).toBeNull();

    // Cien minutos de bici que empezaron 35 después de la última serie.
    const late = await logCardio(sessionId, minutesAgo(5), 100);

    expect(late.status).toBe(201);
    expect((await activeSession())?.id).toBe(sessionId);
  });

  it('empezar el cardio desde la cola reabre la sesión que se cerró sola sin noticias', async () => {
    const sessionId = await openSession(minutesAgo(130));
    expect((await logStrength(sessionId, minutesAgo(120))).status).toBe(201);
    expect(await activeSession()).toBeNull();

    expect((await startCardio(sessionId, minutesAgo(70))).status).toBe(200);

    expect((await activeSession())?.id).toBe(sessionId);
  });

  it('no empieza antes que la sesión ni en una sesión que se cerró a mano', async () => {
    const sessionId = await openSession(minutesAgo(10));

    const early = await startCardio(sessionId, minutesAgo(20));
    expect(early.status).toBe(400);
    expect(await errorCode(early)).toBe('validation_failed');

    await call({ method: 'POST', path: `/sessions/${sessionId}/end`, body: {} });
    const closed = await startCardio(sessionId, minutesAgo(1));
    expect(closed.status).toBe(409);
    expect(await errorCode(closed)).toBe('session_closed');
  });
});
