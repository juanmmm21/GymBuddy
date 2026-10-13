import {
  apiErrorSchema,
  competitionSchema,
  rivalCandidatesSchema,
  userSchema,
  weekIndexOf,
  weekStartDayIndex,
} from '@gymbuddy/shared';
import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { issueSessionToken } from '../src/auth/jwt';
import type { Database } from '../src/db/client';
import {
  catalogExercise,
  personalRecord,
  rival,
  setEntry,
  trackedExercise,
  user,
  workoutSession,
} from '../src/db/schema';
import { app } from '../src/index';
import { seedUsers } from './fixtures';
import { envWithSecrets } from './worker-env';

const BASE = 'https://gymbuddy.test/api/v1';
const JWT_SECRET = 'un-secreto-de-sesion-para-las-pruebas';
const MILLISECONDS_PER_DAY = 86_400_000;
const BENCH = 'pectorals/barbell-bench-press';
const SQUAT = 'quads/barbell-squat';

const competitionEnv = (): Env => envWithSecrets({ JWT_SECRET });
const uuid = (): string => crypto.randomUUID();

/** La ruta lee el reloj real: el escenario se siembra sobre la semana en curso, como en `stats-week`. */
const NOW = new Date();
const WEEK_START_DAY = weekStartDayIndex(weekIndexOf(NOW.getTime()));

function dayAt(dayIndex: number, hours: number): string {
  return new Date((WEEK_START_DAY + dayIndex) * MILLISECONDS_PER_DAY + hours * 3_600_000)
    .toISOString()
    .replace(/\.\d{3}Z$/, '.000Z');
}

async function bearer(userId: string): Promise<string> {
  const { token } = await issueSessionToken(userId, JWT_SECRET, new Date());

  return `Bearer ${token}`;
}

describe('competir con amigos', () => {
  let db: Database;
  /** Juan: quien mira en casi todos los tests. */
  let userId: string;
  /** «Otra»: la segunda cuenta de las fixtures. */
  let otherUserId: string;
  /** Leo: una tercera cuenta, para que haya a quién no elegir. */
  let thirdUserId: string;
  let token: string;

  beforeEach(async () => {
    ({ db, userId, otherUserId } = await seedUsers(env.DB));
    await db.delete(catalogExercise);
    thirdUserId = uuid();
    await db.insert(user).values({
      id: thirdUserId,
      displayName: 'Leo',
      locale: 'es',
      unitSystem: 'metric',
      createdAt: '2026-08-02T08:00:00.000Z',
    });
    token = await bearer(userId);
  });

  async function request(
    method: 'GET' | 'PUT' | 'PATCH',
    path: string,
    authorization: string | null,
    body?: unknown,
  ): Promise<Response> {
    const headers: Record<string, string> = {};
    if (authorization !== null) headers.authorization = authorization;
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    return app.request(`${BASE}${path}`, init, competitionEnv());
  }

  async function setCompetes(id: string, competes: boolean): Promise<void> {
    await db.update(user).set({ competes }).where(eq(user.id, id));
  }

  async function seedCatalog(catalogId: string, nameEs: string): Promise<void> {
    await db.insert(catalogExercise).values({
      catalogId,
      slug: catalogId.split('/')[1] ?? catalogId,
      muscle: catalogId.split('/')[0] ?? 'pectorals',
      bodyPart: 'chest',
      equipment: 'barbell',
      category: 'strength',
      secondaryMuscles: [],
      gifUrl: `https://cdn.example.test/${catalogId}.gif`,
      nameEs,
      nameEn: `${nameEs} (en)`,
      instructionsEs: [],
      instructionsEn: [],
      searchText: nameEs.toLowerCase(),
      catalogVersion: 'v1.1.0',
      syncedAt: dayAt(0, 5),
    });
  }

  /**
   * Una sesión de esta semana con sus series y la marca que dejan, de un ejercicio del catálogo.
   * `sets` son pares de gramos y repeticiones; las marcas se escriben a mano porque aquí no se
   * prueba cómo se detectan, sino cómo se comparan.
   */
  async function seedTraining(
    owner: string,
    catalogId: string,
    dayIndex: number,
    sets: readonly [number, number][],
    marks: { readonly maxWeight: number; readonly oneRepMax: number },
    archived = false,
  ): Promise<void> {
    const exerciseId = uuid();
    await db.insert(trackedExercise).values({
      id: exerciseId,
      userId: owner,
      catalogId,
      customName: null,
      customMuscle: null,
      customBodyPart: null,
      notes: null,
      createdAt: dayAt(0, 6),
      archivedAt: archived ? dayAt(0, 7) : null,
    });

    const sessionId = uuid();
    await db.insert(workoutSession).values({
      id: sessionId,
      userId: owner,
      startedAt: dayAt(dayIndex, 18),
      endedAt: dayAt(dayIndex, 19),
      notes: null,
    });

    const setIds = sets.map(() => uuid());
    await db.insert(setEntry).values(
      sets.map(([weightGrams, reps], index) => ({
        id: setIds[index] ?? uuid(),
        sessionId,
        trackedExerciseId: exerciseId,
        orderIndex: index,
        weightGrams,
        reps,
        rpeTenths: null,
        isWarmup: false,
        completedAt: dayAt(dayIndex, 18),
      })),
    );

    const setEntryId = setIds[0];
    if (setEntryId === undefined) return;
    await db.insert(personalRecord).values([
      {
        id: uuid(),
        userId: owner,
        trackedExerciseId: exerciseId,
        kind: 'max_weight',
        // Una marca anterior ya superada: la vigente es la mayor, no la última fila.
        valueGrams: marks.maxWeight - 5_000,
        setEntryId,
        achievedAt: dayAt(dayIndex, 17),
      },
      {
        id: uuid(),
        userId: owner,
        trackedExerciseId: exerciseId,
        kind: 'max_weight',
        valueGrams: marks.maxWeight,
        setEntryId,
        achievedAt: dayAt(dayIndex, 18),
      },
      {
        id: uuid(),
        userId: owner,
        trackedExerciseId: exerciseId,
        kind: 'estimated_1rm',
        valueGrams: marks.oneRepMax,
        setEntryId,
        achievedAt: dayAt(dayIndex, 18),
      },
    ]);
  }

  describe('activar competir', () => {
    it('una cuenta nueva no compite, y lo activa desde su perfil', async () => {
      const response = await request('PATCH', '/auth/me', token, { competes: true });

      expect(response.status).toBe(200);
      expect(userSchema.parse(await response.json()).competes).toBe(true);

      const [row] = await db.select().from(user).where(eq(user.id, userId));
      expect(row?.competes).toBe(true);
      expect(row?.isAdmin).toBe(false);
    });

    it('cambiar el nombre no toca la casilla', async () => {
      await setCompetes(userId, true);

      const response = await request('PATCH', '/auth/me', token, { displayName: 'Juanma' });

      expect(userSchema.parse(await response.json())).toMatchObject({
        displayName: 'Juanma',
        competes: true,
      });
    });
  });

  describe('a quién se puede elegir', () => {
    it('exige sesión', async () => {
      expect((await request('GET', '/competition/rivals', null)).status).toBe(401);
      expect((await request('GET', '/competition', null)).status).toBe(401);
      expect((await request('PUT', '/competition/rivals', null, { rivalIds: [] })).status).toBe(
        401,
      );
    });

    it('solo salen los que han activado competir, y nunca uno mismo', async () => {
      await setCompetes(userId, true);
      await setCompetes(otherUserId, true);

      const response = await request('GET', '/competition/rivals', token);

      expect(response.status).toBe(200);
      expect(rivalCandidatesSchema.parse(await response.json()).candidates).toEqual([
        { userId: otherUserId, displayName: 'Otra', competes: true, selected: false },
      ]);
    });

    it('la cuenta de administración ve a todos, con quién lo ha activado y quién no', async () => {
      await db.update(user).set({ isAdmin: true }).where(eq(user.id, userId));
      await setCompetes(otherUserId, true);

      const response = await request('GET', '/competition/rivals', token);

      expect(rivalCandidatesSchema.parse(await response.json()).candidates).toEqual([
        { userId: thirdUserId, displayName: 'Leo', competes: false, selected: false },
        { userId: otherUserId, displayName: 'Otra', competes: true, selected: false },
      ]);
    });
  });

  describe('elegir rivales', () => {
    it('guarda la lista y sustituirla quita a los que ya no están', async () => {
      await setCompetes(otherUserId, true);
      await setCompetes(thirdUserId, true);

      const first = await request('PUT', '/competition/rivals', token, {
        rivalIds: [otherUserId, thirdUserId],
      });
      expect(first.status).toBe(200);
      expect(
        rivalCandidatesSchema
          .parse(await first.json())
          .candidates.map((candidate) => candidate.selected),
      ).toEqual([true, true]);

      const second = await request('PUT', '/competition/rivals', token, {
        rivalIds: [thirdUserId],
      });
      expect(second.status).toBe(200);

      const rows = await db.select().from(rival).where(eq(rival.userId, userId));
      expect(rows.map((row) => row.rivalUserId)).toEqual([thirdUserId]);

      const listed = await request('GET', '/competition/rivals', token);
      expect(
        rivalCandidatesSchema
          .parse(await listed.json())
          .candidates.filter((candidate) => candidate.selected)
          .map((candidate) => candidate.userId),
      ).toEqual([thirdUserId]);
    });

    it('la lista vacía deja de competir con todos', async () => {
      await setCompetes(otherUserId, true);
      await request('PUT', '/competition/rivals', token, { rivalIds: [otherUserId] });

      const response = await request('PUT', '/competition/rivals', token, { rivalIds: [] });

      expect(response.status).toBe(200);
      expect(await db.select().from(rival)).toEqual([]);
    });

    it('rechaza a quien no ha activado competir, a uno mismo y a quien no existe, sin escribir nada', async () => {
      await setCompetes(otherUserId, true);
      const stranger = uuid();

      for (const rejected of [thirdUserId, userId, stranger]) {
        const response = await request('PUT', '/competition/rivals', token, {
          rivalIds: [otherUserId, rejected],
        });

        expect(response.status).toBe(400);
        const { error } = apiErrorSchema.parse(await response.json());
        expect(error.code).toBe('validation_failed');
        expect(error.detail).toEqual({ rivalIds: [rejected] });
      }

      expect(await db.select().from(rival)).toEqual([]);
    });

    it('la cuenta de administración puede elegir a quien no lo ha activado', async () => {
      await db.update(user).set({ isAdmin: true }).where(eq(user.id, userId));

      const response = await request('PUT', '/competition/rivals', token, {
        rivalIds: [thirdUserId],
      });

      expect(response.status).toBe(200);
    });

    it('la elección va en un solo sentido: no pone a nadie en la lista del otro', async () => {
      await setCompetes(userId, true);
      await setCompetes(otherUserId, true);
      await request('PUT', '/competition/rivals', token, { rivalIds: [otherUserId] });

      const theirs = await request('GET', '/competition', await bearer(otherUserId));

      expect(
        competitionSchema.parse(await theirs.json()).week.map((entry) => entry.userId),
      ).toEqual([otherUserId]);
    });
  });

  describe('la clasificación', () => {
    it('sin rivales trae solo a quien mira', async () => {
      await seedCatalog(BENCH, 'Press de banca');
      await seedTraining(userId, BENCH, 0, [[80_000, 8]], {
        maxWeight: 80_000,
        oneRepMax: 101_333,
      });

      const response = await request('GET', '/competition', token);

      expect(response.status).toBe(200);
      const competition = competitionSchema.parse(await response.json());
      expect(competition.week).toEqual([
        {
          userId,
          displayName: 'Juan',
          isSelf: true,
          rank: 1,
          daysTrained: 1,
          setCount: 1,
          volume: '640.00',
        },
      ]);
      expect(competition.exercises).toEqual([]);
    });

    it('ordena la semana por días entrenados y compara las marcas del ejercicio común', async () => {
      await setCompetes(otherUserId, true);
      await setCompetes(thirdUserId, true);
      await seedCatalog(BENCH, 'Press de banca');
      await seedCatalog(SQUAT, 'Sentadilla');

      // Juan: un día, dos series. La otra: dos días, una serie cada uno. Leo no ha entrenado.
      await seedTraining(
        userId,
        BENCH,
        0,
        [
          [100_000, 5],
          [100_000, 5],
        ],
        { maxWeight: 100_000, oneRepMax: 116_667 },
      );
      await seedTraining(otherUserId, BENCH, 0, [[60_000, 10]], {
        maxWeight: 60_000,
        oneRepMax: 80_000,
      });
      await seedTraining(otherUserId, SQUAT, 1, [[90_000, 5]], {
        maxWeight: 90_000,
        oneRepMax: 105_000,
      });
      await request('PUT', '/competition/rivals', token, { rivalIds: [otherUserId, thirdUserId] });

      const response = await request('GET', '/competition', token);

      const competition = competitionSchema.parse(await response.json());
      expect(
        competition.week.map((entry) => [entry.displayName, entry.rank, entry.daysTrained]),
      ).toEqual([
        ['Otra', 1, 2],
        ['Juan', 2, 1],
        ['Leo', 3, 0],
      ]);
      expect(competition.week[1]).toMatchObject({ isSelf: true, setCount: 2, volume: '1000.00' });

      // La sentadilla solo la hace la otra: no hay cara a cara.
      expect(competition.exercises).toEqual([
        {
          catalogId: BENCH,
          name: 'Press de banca',
          gifUrl: `https://cdn.example.test/${BENCH}.gif`,
          entries: [
            {
              userId,
              displayName: 'Juan',
              isSelf: true,
              maxWeight: '100.00',
              estimatedOneRepMax: '116.67',
            },
            {
              userId: otherUserId,
              displayName: 'Otra',
              isSelf: false,
              maxWeight: '60.00',
              estimatedOneRepMax: '80.00',
            },
          ],
        },
      ]);
    });

    it('un ejercicio archivado no entra en el cara a cara', async () => {
      await setCompetes(otherUserId, true);
      await seedCatalog(BENCH, 'Press de banca');
      await seedTraining(userId, BENCH, 0, [[100_000, 5]], {
        maxWeight: 100_000,
        oneRepMax: 116_667,
      });
      await seedTraining(
        otherUserId,
        BENCH,
        0,
        [[60_000, 10]],
        { maxWeight: 60_000, oneRepMax: 80_000 },
        true,
      );
      await request('PUT', '/competition/rivals', token, { rivalIds: [otherUserId] });

      const response = await request('GET', '/competition', token);

      expect(competitionSchema.parse(await response.json()).exercises).toEqual([]);
    });

    it('quien desactiva competir desaparece de la clasificación de los demás, y vuelve al reactivarlo', async () => {
      await setCompetes(otherUserId, true);
      await request('PUT', '/competition/rivals', token, { rivalIds: [otherUserId] });

      await setCompetes(otherUserId, false);
      const hidden = await request('GET', '/competition', token);
      expect(
        competitionSchema.parse(await hidden.json()).week.map((entry) => entry.userId),
      ).toEqual([userId]);

      await setCompetes(otherUserId, true);
      const back = await request('GET', '/competition', token);
      expect(competitionSchema.parse(await back.json()).week).toHaveLength(2);
    });
  });
});
