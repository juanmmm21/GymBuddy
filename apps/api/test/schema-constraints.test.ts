import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  authChallenge,
  catalogExercise,
  passkeyCredential,
  setEntry,
  trackedExercise,
  user,
} from '../src/db/schema';
import { seedTrainingScenario, type TrainingScenario } from './fixtures';

let scenario: TrainingScenario;

const CATALOG_ID = 'pectorals/archer-push-up';

beforeEach(async () => {
  scenario = await seedTrainingScenario(env.DB);

  await scenario.db
    .insert(catalogExercise)
    .values({
      catalogId: CATALOG_ID,
      slug: 'archer-push-up',
      muscle: 'pectorals',
      bodyPart: 'chest',
      equipment: 'bodyweight',
      category: 'strength',
      secondaryMuscles: ['triceps', 'delts'],
      gifUrl: `https://cdn.jsdelivr.net/gh/example/${CATALOG_ID}.gif`,
      nameEs: 'Flexión del arquero',
      nameEn: 'Archer push-up',
      instructionsEs: ['Colócate en posición de flexión.'],
      instructionsEn: ['Get into a push-up position.'],
      searchText: 'flexion del arquero',
      catalogVersion: 'v1.1.0',
      syncedAt: '2026-09-07T10:00:00.000Z',
    })
    .onConflictDoNothing();
});

/** Insertar una serie con los valores de la fixture y solo lo que cada caso quiera cambiar. */
function insertSet(overrides: { weightGrams?: number; reps?: number; rpeTenths?: number | null }) {
  const { db, benchId, sessionIds } = scenario;

  return db.insert(setEntry).values({
    id: crypto.randomUUID(),
    sessionId: sessionIds[2],
    trackedExerciseId: benchId,
    orderIndex: 99,
    weightGrams: overrides.weightGrams ?? 80_000,
    reps: overrides.reps ?? 8,
    rpeTenths: overrides.rpeTenths ?? null,
    isWarmup: false,
    completedAt: '2026-08-24T19:00:00.000Z',
  });
}

describe('restricciones de set_entry', () => {
  it('rechaza un peso negativo', async () => {
    await expect(insertSet({ weightGrams: -1 })).rejects.toThrow();
  });

  it('acepta el peso cero, que es lo que vale una serie a peso corporal', async () => {
    await expect(insertSet({ weightGrams: 0 })).resolves.toBeDefined();
  });

  it('rechaza una serie sin repeticiones', async () => {
    await expect(insertSet({ reps: 0 })).rejects.toThrow();
  });

  it('rechaza un rpe que no sea un paso de media unidad dentro de rango', async () => {
    await expect(insertSet({ rpeTenths: 83 })).rejects.toThrow();
    await expect(insertSet({ rpeTenths: 105 })).rejects.toThrow();
    await expect(insertSet({ rpeTenths: 5 })).rejects.toThrow();
  });

  it('acepta un rpe válido', async () => {
    await expect(insertSet({ rpeTenths: 85 })).resolves.toBeDefined();
  });
});

describe('restricciones de tracked_exercise', () => {
  it('rechaza un ejercicio sin catálogo ni nombre propio', async () => {
    const { db, userId } = scenario;

    await expect(
      db.insert(trackedExercise).values({
        id: crypto.randomUUID(),
        userId,
        catalogId: null,
        customName: null,
        createdAt: '2026-09-01T10:00:00.000Z',
      }),
    ).rejects.toThrow();
  });

  it('no deja seguir dos veces el mismo ejercicio del catálogo', async () => {
    const { db, userId } = scenario;

    const insert = (): Promise<unknown> =>
      db.insert(trackedExercise).values({
        id: crypto.randomUUID(),
        userId,
        catalogId: CATALOG_ID,
        customName: null,
        createdAt: '2026-09-01T10:00:00.000Z',
      });

    await expect(insert()).resolves.toBeDefined();
    await expect(insert()).rejects.toThrow();
  });

  it('permite varios ejercicios propios, que no tienen catálogo con el que chocar', async () => {
    const { db, userId } = scenario;

    const insertCustom = (name: string): Promise<unknown> =>
      db.insert(trackedExercise).values({
        id: crypto.randomUUID(),
        userId,
        catalogId: null,
        customName: name,
        createdAt: '2026-09-01T10:00:00.000Z',
      });

    await expect(insertCustom('Face pull con cuerda')).resolves.toBeDefined();
    await expect(insertCustom('Curl martillo')).resolves.toBeDefined();
  });
});

describe('restricciones de identidad', () => {
  it('no guarda un reto de registro sin la cuenta pendiente ni la invitación', async () => {
    const { db } = scenario;

    await expect(
      db.insert(authChallenge).values({
        id: crypto.randomUUID(),
        kind: 'registration',
        challenge: 'q7s9fW2l0sTg1mD8Yb3cXw',
        createdAt: '2026-09-11T10:00:00.000Z',
        expiresAt: '2026-09-11T10:05:00.000Z',
      }),
    ).rejects.toThrow();
  });

  it('borra las passkeys de un usuario junto con el usuario', async () => {
    const { db, userId } = scenario;

    await db.insert(passkeyCredential).values({
      id: 'AQIDBAUGBwg',
      userId,
      publicKey: 'pQECAyYgASFYIA',
      transports: ['internal'],
      backedUp: true,
      createdAt: '2026-09-11T10:00:00.000Z',
    });
    await db.delete(user).where(eq(user.id, userId));

    expect(await db.select().from(passkeyCredential)).toEqual([]);
  });
});

describe('migración que retira la superficie de escritura', () => {
  // La columna se quitó con `DROP COLUMN`, no recreando las tablas: en D1 las claves ajenas
  // están activas y el `DROP TABLE` intermedio de una recreación se llevaría las series.
  it.each(['workout_session', 'set_entry'])(
    '%s ya no guarda de dónde vino el dato',
    async (table) => {
      const columns = await env.DB.prepare('select name from pragma_table_info(?)')
        .bind(table)
        .all<{ name: string }>();

      expect(columns.results.map((column) => column.name)).not.toContain('source');
    },
  );
});
