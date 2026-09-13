import {
  activeSessionResponseSchema,
  apiErrorSchema,
  buildExportFile,
  deriveImportedId,
  exportFileSchema,
  exportSessionPageSchema,
  exportSnapshotSchema,
  importExercisesResponseSchema,
  planImport,
  type ExportFile,
  type ExportedExercise,
  type ExportedSession,
} from '@gymbuddy/shared';
import { env } from 'cloudflare:test';
import { and, count, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { issueSessionToken } from '../src/auth/jwt';
import {
  catalogExercise,
  personalRecord,
  routine,
  routineItem,
  setEntry,
  trackedExercise,
  user,
  workoutSession,
} from '../src/db/schema';
import { app } from '../src/index';
import { seedTrainingScenario, type TrainingScenario } from './fixtures';
import { envWithSecrets } from './worker-env';

const BASE = 'https://gymbuddy.test/api/v1';
const JWT_SECRET = 'un-secreto-de-sesion-para-las-pruebas';
const CATALOG_ID = 'lats/cable-lat-pulldown';
const MISSING_CATALOG_ID = 'lats/not-synced-here';

async function bearer(userId: string): Promise<string> {
  const { token } = await issueSessionToken(userId, JWT_SECRET, new Date());

  return `Bearer ${token}`;
}

async function request(
  method: 'GET' | 'POST',
  path: string,
  token?: string,
  body?: unknown,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (token !== undefined) headers.authorization = token;
  if (body !== undefined) headers['content-type'] = 'application/json';

  return app.request(
    `${BASE}${path}`,
    { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) },
    envWithSecrets({ JWT_SECRET }),
  );
}

async function errorCodeOf(response: Response): Promise<string> {
  return apiErrorSchema.parse(await response.json()).error.code;
}

/** La copia de una cuenta, montada igual que la monta la PWA. */
async function exportFileOf(token: string): Promise<ExportFile> {
  const sessions: ExportedSession[] = [];
  for (let offset = 0; ; offset += 50) {
    const response = await request('GET', `/export/sessions?offset=${String(offset)}`, token);
    const page = exportSessionPageSchema.parse(await response.json());
    sessions.push(...page.items);
    if (page.items.length === 0 || offset + page.items.length >= page.total) break;
  }

  const snapshot = exportSnapshotSchema.parse(
    await (await request('GET', '/export/snapshot', token)).json(),
  );

  return exportFileSchema.parse(buildExportFile(snapshot, sessions));
}

/** Sube un fichero entero en el orden y los lotes de `planImport`, y devuelve lo que entró como propio. */
async function importFile(token: string, file: ExportFile): Promise<string[]> {
  const plan = planImport(file);
  const enteredAsCustom: string[] = [];

  for (const exercises of plan.exercises) {
    const response = await request('POST', '/import/exercises', token, { exercises });
    expect(response.status).toBe(200);
    enteredAsCustom.push(
      ...importExercisesResponseSchema.parse(await response.json()).enteredAsCustom,
    );
  }
  for (const routines of plan.routines) {
    expect((await request('POST', '/import/routines', token, { routines })).status).toBe(204);
  }
  for (const sessions of plan.sessions) {
    expect((await request('POST', '/import/sessions', token, { sessions })).status).toBe(204);
  }

  return enteredAsCustom;
}

/** Quita lo que cambia al importar (los ids) para comparar dos copias por su contenido. */
function contentOf(file: ExportFile): unknown {
  const names = new Map(file.exercises.map((exercise) => [exercise.id, exercise.name]));
  const exerciseName = (id: string): string => names.get(id) ?? id;

  return {
    exercises: file.exercises.map(({ id: _id, ...rest }) => rest),
    routines: file.routines.map(({ id: _id, items, ...rest }) => ({
      ...rest,
      items: items.map(({ id: _itemId, trackedExerciseId, ...item }) => ({
        ...item,
        exercise: exerciseName(trackedExerciseId),
      })),
    })),
    sessions: file.sessions.map(({ id: _id, sets, ...rest }) => ({
      ...rest,
      sets: sets.map(({ id: _setId, trackedExerciseId, records, ...set }) => ({
        ...set,
        exercise: exerciseName(trackedExerciseId),
        records: records.map(({ id: _recordId, ...record }) => record),
      })),
    })),
  };
}

describe('importación de una copia de seguridad', () => {
  let scenario: TrainingScenario;
  let sourceToken: string;
  let targetUserId: string;
  let targetToken: string;

  beforeEach(async () => {
    scenario = await seedTrainingScenario(env.DB);
    sourceToken = await bearer(scenario.userId);
    const { db, userId, benchId, sessionIds } = scenario;

    await db
      .insert(catalogExercise)
      .values({
        catalogId: CATALOG_ID,
        slug: 'cable-lat-pulldown',
        muscle: 'lats',
        bodyPart: 'back',
        equipment: 'cable',
        category: 'strength',
        secondaryMuscles: [],
        gifUrl: `https://cdn.example.test/${CATALOG_ID}.gif`,
        nameEs: 'Jalón al pecho en polea',
        nameEn: 'Cable lat pulldown',
        instructionsEs: [],
        instructionsEn: [],
        searchText: 'jalon al pecho en polea cable lat pulldown',
        catalogVersion: 'v1.1.0',
        syncedAt: '2026-09-07T10:00:00.000Z',
      })
      .onConflictDoNothing();

    const pulldownId = crypto.randomUUID();
    await db.insert(trackedExercise).values({
      id: pulldownId,
      userId,
      catalogId: CATALOG_ID,
      customName: null,
      customMuscle: null,
      customBodyPart: null,
      notes: 'Agarre abierto',
      createdAt: '2026-08-02T08:00:00.000Z',
      archivedAt: null,
    });

    const routineId = crypto.randomUUID();
    await db.insert(routine).values({
      id: routineId,
      userId,
      name: 'Empuje',
      description: 'Lunes',
      createdAt: '2026-08-03T08:00:00.000Z',
      archivedAt: null,
    });
    await db.insert(routineItem).values([
      {
        id: crypto.randomUUID(),
        routineId,
        trackedExerciseId: benchId,
        orderIndex: 0,
        targetSets: 4,
        targetRepsMin: 6,
        targetRepsMax: 8,
      },
      {
        id: crypto.randomUUID(),
        routineId,
        trackedExerciseId: pulldownId,
        orderIndex: 1,
        targetSets: 3,
        targetRepsMin: 10,
        targetRepsMax: 12,
      },
    ]);

    const [topSet] = await db
      .select()
      .from(setEntry)
      .where(and(eq(setEntry.sessionId, sessionIds[2]), eq(setEntry.weightGrams, 82_500)))
      .orderBy(setEntry.orderIndex);
    if (topSet === undefined) throw new Error('La siembra no trae la serie de 82.5 kg');
    await db.insert(personalRecord).values({
      id: crypto.randomUUID(),
      userId,
      trackedExerciseId: benchId,
      kind: 'max_weight',
      valueGrams: 82_500,
      setEntryId: topSet.id,
      achievedAt: topSet.completedAt,
    });

    // La cuenta nueva tras perder los móviles: vacía, mientras la vieja sigue existiendo.
    targetUserId = crypto.randomUUID();
    await db.insert(user).values({
      id: targetUserId,
      displayName: 'Juan otra vez',
      locale: 'es',
      unitSystem: 'metric',
      createdAt: '2026-09-13T08:00:00.000Z',
    });
    targetToken = await bearer(targetUserId);
  });

  it('exige una sesión válida', async () => {
    const response = await request('POST', '/import/exercises', undefined, { exercises: [] });

    expect(response.status).toBe(401);
    expect(await errorCodeOf(response)).toBe('unauthorized');
  });

  it('una cuenta nueva recupera la copia entera mientras la vieja sigue intacta', async () => {
    const file = await exportFileOf(sourceToken);
    const sourceBefore = contentOf(file);

    const enteredAsCustom = await importFile(targetToken, file);
    const restored = await exportFileOf(targetToken);

    expect(enteredAsCustom).toEqual([]);
    // La sesión que estaba abierta entra cerrada a la hora de su última serie; lo demás, igual.
    const closed = file.sessions.map((session) =>
      session.endedAt === null ? { ...session, endedAt: '2026-08-24T18:40:00.000Z' } : session,
    );
    expect(contentOf(restored)).toEqual(contentOf({ ...file, sessions: closed }));

    const sourceIds = new Set([
      ...file.exercises.map((exercise) => exercise.id),
      ...file.sessions.map((session) => session.id),
    ]);
    expect(restored.exercises.some((exercise) => sourceIds.has(exercise.id))).toBe(false);
    expect(restored.sessions.some((session) => sourceIds.has(session.id))).toBe(false);
    expect(contentOf(await exportFileOf(sourceToken))).toEqual(sourceBefore);
  });

  it('importar dos veces no duplica nada', async () => {
    const file = await exportFileOf(sourceToken);

    await importFile(targetToken, file);
    await importFile(targetToken, file);

    const { db } = scenario;
    const [sessions] = await db
      .select({ total: count() })
      .from(workoutSession)
      .where(eq(workoutSession.userId, targetUserId));
    const [records] = await db
      .select({ total: count() })
      .from(personalRecord)
      .where(eq(personalRecord.userId, targetUserId));
    const restored = await exportFileOf(targetToken);

    expect(sessions?.total).toBe(3);
    expect(records?.total).toBe(1);
    expect(restored.exercises).toHaveLength(3);
    expect(restored.sessions.flatMap((session) => session.sets)).toHaveLength(8);
    expect(restored.routines.flatMap((entry) => entry.items)).toHaveLength(2);
  });

  it('la sesión abierta del fichero no deja la cuenta con una sesión abierta', async () => {
    await importFile(targetToken, await exportFileOf(sourceToken));

    const response = await request('GET', '/sessions/active', targetToken);

    expect(activeSessionResponseSchema.parse(await response.json()).session).toBeNull();
  });

  it('un ejercicio del catálogo que aquí no está sincronizado entra como propio con su nombre', async () => {
    const file = await exportFileOf(sourceToken);
    const missing: ExportedExercise = {
      ...(file.exercises[0] as ExportedExercise),
      id: crypto.randomUUID(),
      origin: 'catalog',
      catalogId: MISSING_CATALOG_ID,
      name: 'Remo en máquina del gimnasio',
      muscle: 'lats',
      bodyPart: 'back',
    };

    const enteredAsCustom = await importFile(targetToken, {
      ...file,
      exercises: [...file.exercises, missing],
    });
    const restored = await exportFileOf(targetToken);

    expect(enteredAsCustom).toEqual([MISSING_CATALOG_ID]);
    expect(
      restored.exercises.find((exercise) => exercise.name === 'Remo en máquina del gimnasio'),
    ).toMatchObject({
      origin: 'custom',
      catalogId: null,
      name: 'Remo en máquina del gimnasio',
      muscle: 'lats',
      bodyPart: 'back',
    });
  });

  it('si la cuenta ya sigue un ejercicio del catálogo de la copia, no escribe nada del lote', async () => {
    const file = await exportFileOf(sourceToken);
    const { db } = scenario;
    await db.insert(trackedExercise).values({
      id: crypto.randomUUID(),
      userId: targetUserId,
      catalogId: CATALOG_ID,
      customName: null,
      customMuscle: null,
      customBodyPart: null,
      notes: null,
      createdAt: '2026-09-13T09:00:00.000Z',
      archivedAt: null,
    });

    const response = await request('POST', '/import/exercises', targetToken, {
      exercises: file.exercises,
    });

    expect(response.status).toBe(409);
    const body = apiErrorSchema.parse(await response.json());
    expect(body.error.code).toBe('import_conflict');
    expect(body.error.detail).toEqual({ catalogIds: [CATALOG_ID] });

    const [exercises] = await db
      .select({ total: count() })
      .from(trackedExercise)
      .where(eq(trackedExercise.userId, targetUserId));
    expect(exercises?.total).toBe(1);
  });

  it('las sesiones no entran antes que los ejercicios que nombran', async () => {
    const file = await exportFileOf(sourceToken);

    const sessions = await request('POST', '/import/sessions', targetToken, {
      sessions: file.sessions,
    });
    const routines = await request('POST', '/import/routines', targetToken, {
      routines: file.routines,
    });

    expect(sessions.status).toBe(400);
    expect(await errorCodeOf(sessions)).toBe('validation_failed');
    expect(routines.status).toBe(400);
  });

  it('un id de la copia fabricado a propósito en otra cuenta se rechaza en vez de colgarse de ella', async () => {
    const file = await exportFileOf(sourceToken);
    await importFile(targetToken, { ...file, routines: [], sessions: [] });

    const first = file.sessions[0] as ExportedSession;
    await scenario.db.insert(workoutSession).values({
      id: await deriveImportedId(targetUserId, first.id),
      userId: scenario.otherUserId,
      startedAt: '2026-09-13T08:00:00.000Z',
      endedAt: '2026-09-13T09:00:00.000Z',
      notes: null,
    });

    const response = await request('POST', '/import/sessions', targetToken, {
      sessions: [first],
    });

    expect(response.status).toBe(409);
    expect(await errorCodeOf(response)).toBe('conflicting_write');
  });

  it('valida los topes de cada petición', async () => {
    const file = await exportFileOf(sourceToken);
    const exercise = file.exercises[0] as ExportedExercise;

    const empty = await request('POST', '/import/exercises', targetToken, { exercises: [] });
    const duplicated = await request('POST', '/import/exercises', targetToken, {
      exercises: [
        { ...exercise, origin: 'catalog', catalogId: CATALOG_ID },
        { ...exercise, id: crypto.randomUUID(), origin: 'catalog', catalogId: CATALOG_ID },
      ],
    });

    expect(empty.status).toBe(400);
    expect(duplicated.status).toBe(400);
  });
});
