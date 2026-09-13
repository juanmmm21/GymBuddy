import {
  apiErrorSchema,
  buildExportFile,
  exportFileSchema,
  exportSessionPageSchema,
  exportSnapshotSchema,
  MAX_EXPORT_SESSION_PAGE_SIZE,
  type ExportSessionPage,
  type ExportSnapshot,
  type ExportedSession,
} from '@gymbuddy/shared';
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { issueSessionToken } from '../src/auth/jwt';
import {
  catalogExercise,
  personalRecord,
  routine,
  routineItem,
  setEntry,
  trackedExercise,
} from '../src/db/schema';
import { app } from '../src/index';
import { seedTrainingScenario, type TrainingScenario } from './fixtures';
import { envWithSecrets } from './worker-env';

const BASE = 'https://gymbuddy.test/api/v1';
const JWT_SECRET = 'un-secreto-de-sesion-para-las-pruebas';
const CATALOG_ID = 'lats/cable-lat-pulldown';

async function bearer(userId: string): Promise<string> {
  const { token } = await issueSessionToken(userId, JWT_SECRET, new Date());

  return `Bearer ${token}`;
}

async function get(path: string, token?: string): Promise<Response> {
  return app.request(
    `${BASE}${path}`,
    { headers: token === undefined ? {} : { authorization: token } },
    envWithSecrets({ JWT_SECRET }),
  );
}

async function snapshotOf(token: string): Promise<ExportSnapshot> {
  const response = await get('/export/snapshot', token);
  expect(response.status).toBe(200);

  return exportSnapshotSchema.parse(await response.json());
}

async function sessionPage(token: string, query: string): Promise<ExportSessionPage> {
  const response = await get(`/export/sessions${query}`, token);
  expect(response.status).toBe(200);

  return exportSessionPageSchema.parse(await response.json());
}

/** Lo mismo que hará la PWA: todas las páginas, una tras otra, y luego lo demás. */
async function downloadEverything(token: string, limit: number): Promise<ExportedSession[]> {
  const sessions: ExportedSession[] = [];
  for (let offset = 0; ; offset += limit) {
    const page = await sessionPage(token, `?limit=${String(limit)}&offset=${String(offset)}`);
    sessions.push(...page.items);
    if (page.items.length === 0 || offset + page.items.length >= page.total) return sessions;
  }
}

describe('exportación de los datos del usuario', () => {
  let scenario: TrainingScenario;
  let token: string;
  let pulldownId: string;
  let recordedSetId: string;

  beforeEach(async () => {
    scenario = await seedTrainingScenario(env.DB);
    token = await bearer(scenario.userId);
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

    pulldownId = crypto.randomUUID();
    await db.insert(trackedExercise).values({
      id: pulldownId,
      userId,
      catalogId: CATALOG_ID,
      customName: null,
      customMuscle: null,
      customBodyPart: null,
      notes: 'Agarre abierto',
      createdAt: '2026-08-02T08:00:00.000Z',
      archivedAt: '2026-09-01T08:00:00.000Z',
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

    // La serie de 82.5 kg con RPE 8.5 de la sesión abierta es la que se lleva la marca.
    const sets = await db.select().from(setEntry);
    const topSet = sets.find(
      (set) => set.sessionId === sessionIds[2] && set.weightGrams === 82_500 && set.reps === 8,
    );
    if (topSet === undefined) throw new Error('La siembra no trae la serie de 82.5 kg');
    recordedSetId = topSet.id;

    await db.insert(personalRecord).values({
      id: crypto.randomUUID(),
      userId,
      trackedExerciseId: benchId,
      kind: 'max_weight',
      valueGrams: 82_500,
      setEntryId: recordedSetId,
      achievedAt: topSet.completedAt,
    });
  });

  it('exige una sesión válida', async () => {
    const snapshot = await get('/export/snapshot');
    const sessions = await get('/export/sessions');

    expect(snapshot.status).toBe(401);
    expect(sessions.status).toBe(401);
    expect(apiErrorSchema.parse(await snapshot.json()).error.code).toBe('unauthorized');
  });

  it('el resto de los datos trae perfil, todos los ejercicios —archivados incluidos— y rutinas', async () => {
    const snapshot = await snapshotOf(token);

    expect(snapshot.profile).toEqual({ displayName: 'Juan', locale: 'es', unitSystem: 'metric' });
    expect(snapshot.exercises.map((exercise) => exercise.id)).toEqual([
      scenario.benchId,
      scenario.squatId,
      pulldownId,
    ]);
    expect(snapshot.exercises[2]).toMatchObject({
      origin: 'catalog',
      catalogId: CATALOG_ID,
      name: 'Jalón al pecho en polea',
      muscle: 'lats',
      bodyPart: 'back',
      notes: 'Agarre abierto',
      archivedAt: '2026-09-01T08:00:00.000Z',
    });
    expect(snapshot.exercises[0]).toMatchObject({
      origin: 'custom',
      catalogId: null,
      name: 'Press de banca',
      bodyPart: 'chest',
    });

    expect(snapshot.routines).toHaveLength(1);
    expect(snapshot.routines[0]?.items.map((item) => item.trackedExerciseId)).toEqual([
      scenario.benchId,
      pulldownId,
    ]);
  });

  it('las sesiones salen de la más antigua a la más reciente, con sus series en orden', async () => {
    const page = await sessionPage(token, '');

    expect(page.total).toBe(3);
    expect(page.limit).toBe(MAX_EXPORT_SESSION_PAGE_SIZE);
    expect(page.items.map((session) => session.id)).toEqual(scenario.sessionIds);

    const open = page.items[2];
    expect(open?.endedAt).toBeNull();
    expect(open?.notes).toBe('Sesión sin cerrar');
    expect(open?.sets.map((set) => set.orderIndex)).toEqual([0, 1, 2, 3]);
    expect(open?.sets[0]).toMatchObject({ weight: '60.00', reps: 10, isWarmup: true, rpe: null });
  });

  it('cada marca viaja dentro de la serie que la puso, con el peso como en la API', async () => {
    const page = await sessionPage(token, '');
    const sets = page.items.flatMap((session) => session.sets);

    const recorded = sets.find((set) => set.id === recordedSetId);
    expect(recorded).toMatchObject({ weight: '82.50', reps: 8, rpe: 8.5 });
    expect(recorded?.records).toEqual([
      expect.objectContaining({ kind: 'max_weight', value: '82.50' }),
    ]);
    expect(sets.filter((set) => set.records.length > 0)).toHaveLength(1);
  });

  it('pagina sin saltarse ni repetir ninguna sesión', async () => {
    const first = await sessionPage(token, '?limit=2&offset=0');
    const second = await sessionPage(token, '?limit=2&offset=2');

    expect(first.items.map((session) => session.id)).toEqual(scenario.sessionIds.slice(0, 2));
    expect(second.items.map((session) => session.id)).toEqual(scenario.sessionIds.slice(2));
    expect(second.total).toBe(3);

    const beyond = await sessionPage(token, '?limit=2&offset=4');
    expect(beyond.items).toEqual([]);
  });

  it('no deja pedir páginas por encima del tope', async () => {
    const response = await get(
      `/export/sessions?limit=${String(MAX_EXPORT_SESSION_PAGE_SIZE + 1)}`,
      token,
    );

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe('validation_failed');
  });

  it('no trae nada de otro usuario', async () => {
    const otherToken = await bearer(scenario.otherUserId);

    const snapshot = await snapshotOf(otherToken);
    const page = await sessionPage(otherToken, '');

    expect(snapshot.exercises.map((exercise) => exercise.id)).toEqual([scenario.otherExerciseId]);
    expect(snapshot.routines).toEqual([]);
    expect(page.total).toBe(1);
    expect(page.items[0]?.sets.every((set) => set.records.length === 0)).toBe(true);

    const mine = await sessionPage(token, '');
    const mineIds = new Set(mine.items.map((session) => session.id));
    expect(page.items.some((session) => mineIds.has(session.id))).toBe(false);
  });

  it('las piezas juntas forman un fichero que pasa el esquema del contrato', async () => {
    const sessions = await downloadEverything(token, 1);
    const snapshot = await snapshotOf(token);

    const file = exportFileSchema.parse(buildExportFile(snapshot, sessions));

    expect(file.sessions).toHaveLength(3);
    expect(file.sessions.flatMap((session) => session.sets)).toHaveLength(8);
  });
});
