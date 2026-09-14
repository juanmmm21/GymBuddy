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

  it('con actividad hace menos de veinte minutos la sesión sigue abierta', async () => {
    const sessionId = await openSession(minutesAgo(15));
    expect((await logSet(sessionId, minutesAgo(5))).status).toBe(201);

    expect((await activeSession())?.id).toBe(sessionId);
  });

  it('a los veinte minutos se cierra sola, a la hora de la última serie', async () => {
    const lastSet = minutesAgo(35);
    const sessionId = await openSession(minutesAgo(60));
    expect((await logSet(sessionId, minutesAgo(50))).status).toBe(201);
    expect((await logSet(sessionId, lastSet)).status).toBe(201);

    expect(await activeSession()).toBeNull();
    expect((await readSession(sessionId)).endedAt).toBe(lastSet);
  });

  it('una sesión empezada y sin series se cierra a la hora en que empezó, también en el historial', async () => {
    const startedAt = minutesAgo(30);
    const sessionId = await openSession(startedAt);

    const history = workoutSessionPageSchema.parse(
      await (await call({ method: 'GET', path: '/history/sessions' })).json(),
    );

    expect(history.items.find((session) => session.id === sessionId)?.endedAt).toBe(startedAt);
  });

  it('una sesión abandonada no impide empezar la siguiente', async () => {
    await openSession(minutesAgo(90));

    const next = await call({ method: 'POST', path: '/sessions', body: { id: uuid() } });

    expect(next.status).toBe(201);
  });

  it('las series que traía la cola sin cobertura reabren la sesión mientras continúan su actividad', async () => {
    const sessionId = await openSession(minutesAgo(60));

    // Cada una llega con la sesión ya dada por cerrada, pero a menos de veinte minutos de la anterior.
    for (const minutes of [55, 40, 25, 10]) {
      expect((await logSet(sessionId, minutesAgo(minutes))).status).toBe(201);
    }

    const session = await readSession(sessionId);
    expect(session.sets).toHaveLength(4);
    // La última fue hace diez minutos: la sesión vuelve a estar en curso.
    expect(session.endedAt).toBeNull();
  });

  it('una serie que ya no continúa la actividad es otro entrenamiento y se rechaza', async () => {
    const sessionId = await openSession(minutesAgo(60));
    expect((await logSet(sessionId, minutesAgo(55))).status).toBe(201);

    const late = await logSet(sessionId, minutesAgo(3));

    expect(late.status).toBe(409);
    expect(await errorCode(late)).toBe('session_closed');
    expect((await readSession(sessionId)).endedAt).toBe(
      (await readSession(sessionId)).sets[0]?.completedAt,
    );
  });

  it('una sesión que cerró quien entrenaba no se reabre nunca', async () => {
    const sessionId = await openSession(minutesAgo(30));
    const closedAt = minutesAgo(25);
    await call({ method: 'POST', path: `/sessions/${sessionId}/end`, body: { endedAt: closedAt } });

    const late = await logSet(sessionId, minutesAgo(24));

    expect(late.status).toBe(409);
    expect(await errorCode(late)).toBe('session_closed');
  });

  it('no se reabre si ya hay otra sesión abierta', async () => {
    const abandoned = await openSession(minutesAgo(60));
    await openSession(minutesAgo(1));

    const late = await logSet(abandoned, minutesAgo(50));

    expect(late.status).toBe(409);
    expect(await errorCode(late)).toBe('session_closed');
  });

  it('un «Terminar» de la cola dentro del margen deja la hora de quien entrenaba', async () => {
    const sessionId = await openSession(minutesAgo(60));
    expect((await logSet(sessionId, minutesAgo(55))).status).toBe(201);
    const pressedAt = minutesAgo(45);

    const ended = await call({
      method: 'POST',
      path: `/sessions/${sessionId}/end`,
      body: { endedAt: pressedAt },
    });

    expect(workoutSessionDetailSchema.parse(await ended.json()).endedAt).toBe(pressedAt);
  });

  it('una corrección que llega de la cola entra aunque la sesión se cerrara sola', async () => {
    const sessionId = await openSession(minutesAgo(60));
    const logged = await logSet(sessionId, minutesAgo(55));
    const { set } = logSetResponseSchema.parse(await logged.json());

    const corrected = await call({
      method: 'PATCH',
      path: `/sessions/${sessionId}/sets/${set.id}`,
      body: { reps: 10 },
    });

    expect(corrected.status).toBe(200);
  });
});
