import {
  activeSessionResponseSchema,
  apiErrorSchema,
  logSetResponseSchema,
  workoutSessionDetailSchema,
  workoutSessionPageSchema,
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
  readonly method: 'GET' | 'POST' | 'PATCH';
  readonly path: string;
  readonly body?: unknown;
}

describe('cierre automático de sesiones inactivas (ADR 0008)', () => {
  let token: string;
  let exerciseId: string;

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

  const logSet = (sessionId: string, completedAt: string): Promise<Response> =>
    call({
      method: 'POST',
      path: `/sessions/${sessionId}/sets`,
      body: { id: uuid(), trackedExerciseId: exerciseId, weight: '80.00', reps: 8, completedAt },
    });

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
    exerciseId = uuid();
    await call({
      method: 'POST',
      path: '/exercises',
      body: { id: exerciseId, origin: 'custom', name: 'Press de banca', bodyPart: 'chest' },
    });
  });

  it('con actividad hace menos de una hora la sesión sigue abierta', async () => {
    const sessionId = await openSession(minutesAgo(45));
    expect((await logSet(sessionId, minutesAgo(15))).status).toBe(201);

    expect((await activeSession())?.id).toBe(sessionId);
  });

  it('a la hora sin actividad se cierra sola, a la hora de la última serie', async () => {
    const lastSet = minutesAgo(105);
    const sessionId = await openSession(minutesAgo(180));
    expect((await logSet(sessionId, minutesAgo(150))).status).toBe(201);
    expect((await logSet(sessionId, lastSet)).status).toBe(201);

    expect(await activeSession()).toBeNull();
    expect((await readSession(sessionId)).endedAt).toBe(lastSet);
  });

  it('una sesión empezada y sin series se cierra a la hora en que empezó, también en el historial', async () => {
    const startedAt = minutesAgo(90);
    const sessionId = await openSession(startedAt);

    const history = workoutSessionPageSchema.parse(
      await (await call({ method: 'GET', path: '/history/sessions' })).json(),
    );

    expect(history.items.find((session) => session.id === sessionId)?.endedAt).toBe(startedAt);
  });

  it('una sesión abandonada no impide empezar la siguiente', async () => {
    await openSession(minutesAgo(270));

    const next = await call({ method: 'POST', path: '/sessions', body: { id: uuid() } });

    expect(next.status).toBe(201);
  });

  it('las series que traía la cola sin cobertura reabren la sesión mientras continúan su actividad', async () => {
    const sessionId = await openSession(minutesAgo(180));

    // Cada una llega con la sesión ya dada por cerrada, pero a menos de una hora de la anterior.
    for (const minutes of [165, 120, 75, 30]) {
      expect((await logSet(sessionId, minutesAgo(minutes))).status).toBe(201);
    }

    const session = await readSession(sessionId);
    expect(session.sets).toHaveLength(4);
    // La última fue hace media hora: la sesión vuelve a estar en curso.
    expect(session.endedAt).toBeNull();
  });

  it('una serie que ya no continúa la actividad es otro entrenamiento y se rechaza', async () => {
    const sessionId = await openSession(minutesAgo(180));
    expect((await logSet(sessionId, minutesAgo(165))).status).toBe(201);

    const late = await logSet(sessionId, minutesAgo(9));

    expect(late.status).toBe(409);
    expect(await errorCode(late)).toBe('session_closed');
    expect((await readSession(sessionId)).endedAt).toBe(
      (await readSession(sessionId)).sets[0]?.completedAt,
    );
  });

  it('una sesión que cerró quien entrenaba no se reabre nunca', async () => {
    const sessionId = await openSession(minutesAgo(90));
    const closedAt = minutesAgo(75);
    await call({ method: 'POST', path: `/sessions/${sessionId}/end`, body: { endedAt: closedAt } });

    const late = await logSet(sessionId, minutesAgo(72));

    expect(late.status).toBe(409);
    expect(await errorCode(late)).toBe('session_closed');
  });

  it('no se reabre si ya hay otra sesión abierta', async () => {
    const abandoned = await openSession(minutesAgo(180));
    await openSession(minutesAgo(3));

    const late = await logSet(abandoned, minutesAgo(150));

    expect(late.status).toBe(409);
    expect(await errorCode(late)).toBe('session_closed');
  });

  it('un «Terminar» de la cola dentro del margen deja la hora de quien entrenaba', async () => {
    const sessionId = await openSession(minutesAgo(180));
    expect((await logSet(sessionId, minutesAgo(165))).status).toBe(201);
    const pressedAt = minutesAgo(135);

    const ended = await call({
      method: 'POST',
      path: `/sessions/${sessionId}/end`,
      body: { endedAt: pressedAt },
    });

    expect(workoutSessionDetailSchema.parse(await ended.json()).endedAt).toBe(pressedAt);
  });

  it('una corrección que llega de la cola entra aunque la sesión se cerrara sola', async () => {
    const sessionId = await openSession(minutesAgo(180));
    const logged = await logSet(sessionId, minutesAgo(165));
    const { set } = logSetResponseSchema.parse(await logged.json());

    const corrected = await call({
      method: 'PATCH',
      path: `/sessions/${sessionId}/sets/${set.id}`,
      body: { reps: 10 },
    });

    expect(corrected.status).toBe(200);
  });
});
