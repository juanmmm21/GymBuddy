import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  findLastSessionForExercise,
  listExerciseHistory,
  listSetsForSession,
} from '../src/db/queries';
import { seedTrainingScenario, type TrainingScenario } from './fixtures';

let scenario: TrainingScenario;

beforeEach(async () => {
  scenario = await seedTrainingScenario(env.DB);
});

describe('listSetsForSession', () => {
  it('devuelve las series de la sesión en el orden en que se registraron', async () => {
    const { db, userId, sessionIds } = scenario;

    const sets = await listSetsForSession(db, userId, sessionIds[2]);

    expect(sets.map((set) => set.orderIndex)).toEqual([0, 1, 2, 3]);
    expect(sets.map((set) => set.weightGrams)).toEqual([60_000, 82_500, 82_500, 102_500]);
  });

  it('no devuelve nada si la sesión es de otro usuario', async () => {
    const { db, otherUserId, sessionIds } = scenario;

    await expect(listSetsForSession(db, otherUserId, sessionIds[2])).resolves.toEqual([]);
  });
});

describe('listExerciseHistory', () => {
  it('ordena de la sesión más reciente a la más antigua y agrupa sus series', async () => {
    const { db, userId, benchId, sessionIds } = scenario;

    const history = await listExerciseHistory(db, userId, benchId, 5);

    expect(history.map((entry) => entry.sessionId)).toEqual([sessionIds[2], sessionIds[1]]);
    expect(history[0]?.sets).toHaveLength(3);
    expect(history[1]?.sets).toHaveLength(2);
  });

  it('deja fuera las sesiones en las que no se hizo ese ejercicio', async () => {
    const { db, userId, benchId, sessionIds } = scenario;

    const history = await listExerciseHistory(db, userId, benchId, 5);

    expect(history.map((entry) => entry.sessionId)).not.toContain(sessionIds[0]);
  });

  it('solo trae las series del ejercicio pedido, no el resto de la sesión', async () => {
    const { db, userId, benchId } = scenario;

    const history = await listExerciseHistory(db, userId, benchId, 5);

    expect(
      history.every((entry) => entry.sets.every((set) => set.trackedExerciseId === benchId)),
    ).toBe(true);
  });

  it('respeta el límite de sesiones', async () => {
    const { db, userId, benchId, sessionIds } = scenario;

    const history = await listExerciseHistory(db, userId, benchId, 1);

    expect(history).toHaveLength(1);
    expect(history[0]?.sessionId).toBe(sessionIds[2]);
  });

  it('devuelve una lista vacía para un ejercicio de otro usuario', async () => {
    const { db, otherUserId, benchId } = scenario;

    await expect(listExerciseHistory(db, otherUserId, benchId, 5)).resolves.toEqual([]);
  });
});

describe('findLastSessionForExercise', () => {
  it('devuelve la última sesión del ejercicio con sus pesos en gramos enteros', async () => {
    const { db, userId, benchId, sessionIds } = scenario;

    const last = await findLastSessionForExercise(db, userId, benchId);

    expect(last?.sessionId).toBe(sessionIds[2]);
    expect(last?.endedAt).toBeNull();
    expect(last?.sets.map((set) => set.weightGrams)).toEqual([60_000, 82_500, 82_500]);
    expect(last?.sets.every((set) => Number.isInteger(set.weightGrams))).toBe(true);
  });

  it('conserva el calentamiento y el rpe tal como se registraron', async () => {
    const { db, userId, benchId } = scenario;

    const last = await findLastSessionForExercise(db, userId, benchId);

    expect(last?.sets.map((set) => set.isWarmup)).toEqual([true, false, false]);
    expect(last?.sets.map((set) => set.rpeTenths)).toEqual([null, 85, 95]);
  });

  it('devuelve null cuando el ejercicio no se ha hecho nunca', async () => {
    const { db, userId } = scenario;

    await expect(findLastSessionForExercise(db, userId, crypto.randomUUID())).resolves.toBeNull();
  });
});
