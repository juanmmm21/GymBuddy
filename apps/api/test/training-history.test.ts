import { apiErrorSchema, exerciseHistorySchema, workoutSessionPageSchema } from '@gymbuddy/shared';
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { issueSessionToken } from '../src/auth/jwt';
import { app } from '../src/index';
import { seedTrainingScenario, type TrainingScenario } from './fixtures';
import { envWithSecrets } from './worker-env';

const BASE = 'https://gymbuddy.test/api/v1';
const JWT_SECRET = 'un-secreto-de-sesion-para-las-pruebas';

const historyEnv = (): Env => envWithSecrets({ JWT_SECRET });

async function get(path: string, token: string): Promise<Response> {
  return app.request(`${BASE}${path}`, { headers: { authorization: token } }, historyEnv());
}

async function bearer(userId: string): Promise<string> {
  const { token } = await issueSessionToken(userId, JWT_SECRET, new Date());

  return `Bearer ${token}`;
}

describe('historial de entrenamiento', () => {
  let scenario: TrainingScenario;
  let token: string;
  let otherToken: string;

  beforeEach(async () => {
    scenario = await seedTrainingScenario(env.DB);
    token = await bearer(scenario.userId);
    otherToken = await bearer(scenario.otherUserId);
  });

  it('lista las sesiones de la más reciente a la más antigua con su recuento de series', async () => {
    const response = await get('/history/sessions', token);

    const page = workoutSessionPageSchema.parse(await response.json());
    expect(page.total).toBe(3);
    expect(page.items.map((session) => session.id)).toEqual([
      scenario.sessionIds[2],
      scenario.sessionIds[1],
      scenario.sessionIds[0],
    ]);
    expect(page.items.map((session) => session.setCount)).toEqual([4, 2, 2]);
    // La sesión en curso aparece en el historial con su cierre a nulo.
    expect(page.items[0]?.endedAt).toBeNull();
  });

  it('pagina sin perder el total', async () => {
    const response = await get('/history/sessions?limit=2&offset=2', token);

    const page = workoutSessionPageSchema.parse(await response.json());
    expect(page.total).toBe(3);
    expect(page.limit).toBe(2);
    expect(page.items.map((session) => session.id)).toEqual([scenario.sessionIds[0]]);
  });

  it('acota por fechas comparando siempre en UTC', async () => {
    // El límite va con desfase negativo a propósito: son las 19:00 UTC, pero comparado como
    // texto contra un "18:00Z" almacenado saldría antes y dejaría fuera la sesión en curso.
    const response = await get(
      '/history/sessions?from=2026-08-17T00:00:00.000Z&to=2026-08-24T14:00:00-05:00',
      token,
    );

    const page = workoutSessionPageSchema.parse(await response.json());
    expect(page.items.map((session) => session.id)).toEqual([
      scenario.sessionIds[2],
      scenario.sessionIds[1],
    ]);
  });

  it('agrupa el historial de un ejercicio por sesión y deja fuera las que no lo trabajaron', async () => {
    const response = await get(`/history/exercises/${scenario.benchId}`, token);

    const history = exerciseHistorySchema.parse(await response.json());
    expect(history.trackedExerciseId).toBe(scenario.benchId);
    expect(history.sessions.map((session) => session.sessionId)).toEqual([
      scenario.sessionIds[2],
      scenario.sessionIds[1],
    ]);
    expect(history.sessions[0]?.sets.map((set) => set.weight)).toEqual(['60.00', '82.50', '82.50']);
    // El RPE viaja en la unidad del contrato, no en las décimas con las que se guarda.
    expect(history.sessions[0]?.sets[1]?.rpe).toBe(8.5);
  });

  it('limita el historial al número de sesiones pedido', async () => {
    const response = await get(`/history/exercises/${scenario.benchId}?sessions=1`, token);

    const history = exerciseHistorySchema.parse(await response.json());
    expect(history.sessions).toHaveLength(1);
    expect(history.sessions[0]?.sessionId).toBe(scenario.sessionIds[2]);
  });

  it('no cuenta el historial de un ejercicio ajeno como vacío, sino como inexistente', async () => {
    const response = await get(`/history/exercises/${scenario.benchId}`, otherToken);

    expect(response.status).toBe(404);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe('not_found');
  });

  it('rechaza una ventana de fechas que no es ISO 8601', async () => {
    const response = await get('/history/sessions?from=ayer', token);

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe('validation_failed');
  });
});
