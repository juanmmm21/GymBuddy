import {
  isoDateOfDay,
  weekIndexOf,
  weekStartDayIndex,
  weeklyCalendarSchema,
} from '@gymbuddy/shared';
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { issueSessionToken } from '../src/auth/jwt';
import type { Database } from '../src/db/client';
import { catalogExercise, setEntry, trackedExercise, workoutSession } from '../src/db/schema';
import { app } from '../src/index';
import { getWeeklyCalendar } from '../src/training/index';
import { seedUsers } from './fixtures';
import { envWithSecrets } from './worker-env';

const BASE = 'https://gymbuddy.test/api/v1';
const JWT_SECRET = 'un-secreto-de-sesion-para-las-pruebas';
const MILLISECONDS_PER_DAY = 86_400_000;

const weekEnv = (): Env => envWithSecrets({ JWT_SECRET });
const uuid = (): string => crypto.randomUUID();

/**
 * La ruta lee el reloj real, así que el escenario se siembra sobre la semana en curso con
 * la misma aritmética del dominio. Fijar un día del calendario haría que el test caducara.
 */
const NOW = new Date();
const WEEK_START_DAY = weekStartDayIndex(weekIndexOf(NOW.getTime()));

/** Un instante del día `dayIndex` (0 lunes) de la semana en curso. */
function dayAt(dayIndex: number, hours: number): string {
  return new Date((WEEK_START_DAY + dayIndex) * MILLISECONDS_PER_DAY + hours * 3_600_000)
    .toISOString()
    .replace(/\.\d{3}Z$/, '.000Z');
}

async function bearer(userId: string): Promise<string> {
  const { token } = await issueSessionToken(userId, JWT_SECRET, new Date());

  return `Bearer ${token}`;
}

interface SeedSetOptions {
  readonly weightGrams?: number;
  readonly reps?: number;
  readonly isWarmup?: boolean;
}

describe('calendario de la semana', () => {
  let db: Database;
  let userId: string;
  let otherUserId: string;
  let token: string;

  beforeEach(async () => {
    ({ db, userId, otherUserId } = await seedUsers(env.DB));
    token = await bearer(userId);
  });

  /** Un ejercicio propio; sin `bodyPart` es uno de esos que el usuario no clasificó. */
  async function seedExercise(
    owner: string,
    name: string,
    bodyPart: string | null,
  ): Promise<string> {
    const exerciseId = uuid();
    await db.insert(trackedExercise).values({
      id: exerciseId,
      userId: owner,
      catalogId: null,
      customName: name,
      customMuscle: null,
      customBodyPart: bodyPart,
      notes: null,
      createdAt: dayAt(0, 6),
      archivedAt: null,
    });

    return exerciseId;
  }

  /** Un ejercicio seguido del catálogo: su parte del cuerpo la pone el catálogo, no el usuario. */
  async function seedCatalogExercise(owner: string, catalogId: string, part: string) {
    await db.insert(catalogExercise).values({
      catalogId,
      slug: catalogId.split('/')[1] ?? catalogId,
      muscle: catalogId.split('/')[0] ?? 'pectorals',
      bodyPart: part,
      equipment: 'barbell',
      category: 'strength',
      secondaryMuscles: [],
      gifUrl: `https://cdn.example.test/${catalogId}.gif`,
      nameEs: 'Press de banca',
      nameEn: 'Bench press',
      instructionsEs: [],
      instructionsEn: [],
      searchText: 'press de banca bench press',
      catalogVersion: 'v1.1.0',
      syncedAt: dayAt(0, 5),
    });

    const exerciseId = uuid();
    await db.insert(trackedExercise).values({
      id: exerciseId,
      userId: owner,
      catalogId,
      customName: null,
      customMuscle: null,
      // El usuario no lo clasifica: si esto se leyera, la etiqueta saldría mal.
      customBodyPart: null,
      notes: null,
      createdAt: dayAt(0, 6),
      archivedAt: null,
    });

    return exerciseId;
  }

  async function seedSession(
    owner: string,
    startedAt: string,
    sets: readonly (SeedSetOptions & { exerciseId: string })[],
  ): Promise<string> {
    const sessionId = uuid();
    await db.insert(workoutSession).values({
      id: sessionId,
      userId: owner,
      startedAt,
      endedAt: null,
      notes: null,
      source: 'web',
    });

    if (sets.length > 0) {
      await db.insert(setEntry).values(
        sets.map((entry, index) => ({
          id: uuid(),
          sessionId,
          trackedExerciseId: entry.exerciseId,
          orderIndex: index,
          weightGrams: entry.weightGrams ?? 80_000,
          reps: entry.reps ?? 8,
          rpeTenths: null,
          isWarmup: entry.isWarmup ?? false,
          completedAt: startedAt,
          source: 'web' as const,
        })),
      );
    }

    return sessionId;
  }

  async function fetchWeek(auth: string): Promise<Response> {
    return app.request(`${BASE}/stats/week`, { headers: { authorization: auth } }, weekEnv());
  }

  it('sin nada entrenado devuelve los siete días de la semana en gris', async () => {
    const response = await fetchWeek(token);
    expect(response.status).toBe(200);

    const week = weeklyCalendarSchema.parse(await response.json());

    expect(week.weekStart).toBe(isoDateOfDay(WEEK_START_DAY));
    expect(week.days).toHaveLength(7);
    expect(week.days.every((day) => !day.trained)).toBe(true);
    expect(week.days.every((day) => day.bodyPart === null)).toBe(true);
    expect(week.days.map((day) => day.date)).toStrictEqual(
      Array.from({ length: 7 }, (_unused, index) => isoDateOfDay(WEEK_START_DAY + index)),
    );
  });

  it('etiqueta el día con la parte del cuerpo de más volumen', async () => {
    const chest = await seedExercise(userId, 'Press de banca', 'chest');
    const arms = await seedExercise(userId, 'Curl', 'arms');

    await seedSession(userId, dayAt(0, 18), [
      { exerciseId: chest, weightGrams: 80_000, reps: 8 },
      { exerciseId: chest, weightGrams: 80_000, reps: 8 },
      { exerciseId: arms, weightGrams: 20_000, reps: 10 },
    ]);

    const week = weeklyCalendarSchema.parse(await (await fetchWeek(token)).json());

    expect(week.days[0]?.trained).toBe(true);
    expect(week.days[0]?.bodyPart).toBe('chest');
    // 80 × 8 × 2 + 20 × 10 kilos.
    expect(week.days[0]?.volume).toBe('1480.00');
    expect(week.days[0]?.setCount).toBe(3);
  });

  it('la parte del cuerpo de un ejercicio del catálogo la pone el catálogo', async () => {
    const exerciseId = await seedCatalogExercise(userId, 'quads/barbell-squat', 'legs');
    await seedSession(userId, dayAt(1, 19), [{ exerciseId, weightGrams: 100_000, reps: 5 }]);

    const week = weeklyCalendarSchema.parse(await (await fetchWeek(token)).json());

    expect(week.days[1]?.bodyPart).toBe('legs');
  });

  it('un día de ejercicios propios sin clasificar cuenta como entrenado y sin etiqueta', async () => {
    const exerciseId = await seedExercise(userId, 'Remo en anillas', null);
    await seedSession(userId, dayAt(2, 20), [{ exerciseId, weightGrams: 0, reps: 12 }]);

    const week = weeklyCalendarSchema.parse(await (await fetchWeek(token)).json());

    expect(week.days[2]?.trained).toBe(true);
    expect(week.days[2]?.bodyPart).toBeNull();
    expect(week.days[2]?.volume).toBe('0.00');
  });

  it('la semana de un usuario no ve las sesiones del otro', async () => {
    const mine = await seedExercise(userId, 'Press de banca', 'chest');
    const theirs = await seedExercise(otherUserId, 'Sentadilla', 'legs');

    await seedSession(userId, dayAt(3, 18), [{ exerciseId: mine }]);
    await seedSession(otherUserId, dayAt(4, 18), [{ exerciseId: theirs }]);

    const week = weeklyCalendarSchema.parse(await (await fetchWeek(token)).json());

    expect(week.days[3]?.bodyPart).toBe('chest');
    expect(week.days[4]?.trained).toBe(false);
  });

  it('la semana pasada no se cuela en la de ahora', async () => {
    const exerciseId = await seedExercise(userId, 'Press de banca', 'chest');
    const lastWeek = new Date((WEEK_START_DAY - 2) * MILLISECONDS_PER_DAY + 18 * 3_600_000);

    await seedSession(userId, lastWeek.toISOString(), [{ exerciseId }]);
    await seedSession(userId, dayAt(0, 18), [{ exerciseId }]);

    const week = await getWeeklyCalendar(db, userId, NOW);

    expect(week.days.filter((day) => day.trained)).toHaveLength(1);
    expect(week.days[0]?.trained).toBe(true);
  });

  it('sin sesión no se ve la semana de nadie', async () => {
    const response = await app.request(`${BASE}/stats/week`, {}, weekEnv());

    expect(response.status).toBe(401);
  });
});
