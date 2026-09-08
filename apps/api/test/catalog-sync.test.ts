import { env } from 'cloudflare:test';
import { count, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { CatalogSourceError } from '../src/catalog/client';
import { readCatalogSyncStatus, runCatalogSyncStep, SYNC_MUSCLE_ORDER } from '../src/catalog/index';
import { createDatabase, type Database } from '../src/db/client';
import { catalogExercise, catalogSyncState } from '../src/db/schema';
import {
  createCatalogFetch,
  DEFAULT_SOURCE_FIXTURES,
  muscleFile,
  BENCH_PRESS_EN,
  BENCH_PRESS_ES,
  type CatalogSourceFixtures,
} from './catalog-fixtures';

/** Los ejercicios que traen las fixtures por defecto: uno, uno y dos. */
const FIXTURE_EXERCISE_COUNT = 4;

const noWait = (): Promise<void> => Promise.resolve();

/** Reloj falso que avanza un minuto por paso: sin él, `synced_at` no distingue ciclos. */
function createClock(start: string): () => Date {
  let current = new Date(start).getTime();
  return () => {
    current += 60_000;
    return new Date(current);
  };
}

async function resetCatalog(db: Database): Promise<void> {
  await db.delete(catalogSyncState);
  await db.delete(catalogExercise);
}

async function countExercises(db: Database): Promise<number> {
  const [row] = await db.select({ total: count() }).from(catalogExercise);
  return row?.total ?? 0;
}

/** Recorre el ciclo entero, un músculo por invocación, como haría el Cron Trigger. */
async function runFullCycle(
  db: Database,
  fetchImpl: typeof fetch,
  clock: () => Date,
  force = false,
): Promise<number> {
  let steps = 0;
  let nextMuscle: string | null = SYNC_MUSCLE_ORDER[0] ?? null;

  while (nextMuscle !== null) {
    const step = await runCatalogSyncStep(db, {
      fetchImpl,
      sleep: noWait,
      now: clock(),
      force: force && steps === 0,
    });
    nextMuscle = step.status.nextMuscle;
    steps += 1;
  }

  return steps;
}

describe('sincronización del catálogo', () => {
  let db: Database;

  beforeEach(async () => {
    db = createDatabase(env.DB);
    await resetCatalog(db);
  });

  it('sincroniza un solo músculo por invocación y deja apuntado el siguiente', async () => {
    const cdn = createCatalogFetch();

    const step = await runCatalogSyncStep(db, {
      fetchImpl: cdn.fetch,
      sleep: noWait,
      now: new Date('2026-09-08T10:00:00.000Z'),
    });

    expect(step.syncedMuscle).toBe('abductors');
    expect(step.status.nextMuscle).toBe('abs');
    expect(step.status.completedAt).toBeNull();
    // Dos descargas, una por idioma: el límite de CPU prohíbe traer más de un músculo.
    expect(cdn.calls).toHaveLength(2);
    expect(await countExercises(db)).toBe(1);
  });

  it('completa el catálogo en diecinueve invocaciones', async () => {
    const cdn = createCatalogFetch();
    const steps = await runFullCycle(db, cdn.fetch, createClock('2026-09-08T10:00:00.000Z'));

    expect(steps).toBe(SYNC_MUSCLE_ORDER.length);
    expect(steps).toBe(19);

    const status = await readCatalogSyncStatus(db);
    expect(status?.nextMuscle).toBeNull();
    expect(status?.completedAt).not.toBeNull();
    expect(status?.exerciseCount).toBe(FIXTURE_EXERCISE_COUNT);
    expect(status?.catalogVersion).toBe('v1.1.0');
  });

  it('es idempotente: repetir un músculo deja la base igual', async () => {
    const cdn = createCatalogFetch();
    const clock = createClock('2026-09-08T10:00:00.000Z');

    await runCatalogSyncStep(db, { fetchImpl: cdn.fetch, sleep: noWait, now: clock() });
    const first = await countExercises(db);

    // `force` rearranca el ciclo, así que el mismo músculo se vuelve a traer entero.
    const repeated = await runCatalogSyncStep(db, {
      fetchImpl: cdn.fetch,
      sleep: noWait,
      now: clock(),
      force: true,
    });

    expect(repeated.syncedMuscle).toBe('abductors');
    expect(await countExercises(db)).toBe(first);
  });

  it('no vuelve a tocar el origen cuando el ciclo terminó y el tag no cambió', async () => {
    const clock = createClock('2026-09-08T10:00:00.000Z');
    await runFullCycle(db, createCatalogFetch().fetch, clock);

    const idleCdn = createCatalogFetch();
    const step = await runCatalogSyncStep(db, {
      fetchImpl: idleCdn.fetch,
      sleep: noWait,
      now: clock(),
    });

    expect(step.syncedMuscle).toBeNull();
    expect(step.exercisesUpserted).toBe(0);
    // El catálogo está anclado a un tag inmutable: bajarlo otra vez no traería nada nuevo.
    expect(idleCdn.calls).toEqual([]);
  });

  it('retira al cerrar el ciclo los ejercicios que el origen ya no publica', async () => {
    const clock = createClock('2026-09-08T10:00:00.000Z');
    await runFullCycle(db, createCatalogFetch().fetch, clock);
    expect(await countExercises(db)).toBe(FIXTURE_EXERCISE_COUNT);

    const shrunk: CatalogSourceFixtures = {
      ...DEFAULT_SOURCE_FIXTURES,
      pectorals: {
        es: muscleFile('pectorals', [BENCH_PRESS_ES]),
        en: muscleFile('pectorals', [BENCH_PRESS_EN]),
      },
    };

    await runFullCycle(db, createCatalogFetch(shrunk).fetch, clock, true);

    expect(await countExercises(db)).toBe(FIXTURE_EXERCISE_COUNT - 1);
    const [archer] = await db
      .select()
      .from(catalogExercise)
      .where(eq(catalogExercise.catalogId, 'pectorals/archer-push-up'));
    expect(archer).toBeUndefined();
  });

  it('deja el puntero donde estaba cuando el origen falla', async () => {
    const cdn = createCatalogFetch();
    const clock = createClock('2026-09-08T10:00:00.000Z');
    await runCatalogSyncStep(db, { fetchImpl: cdn.fetch, sleep: noWait, now: clock() });

    const down: typeof fetch = () => Promise.resolve(new Response('down', { status: 500 }));
    await expect(
      runCatalogSyncStep(db, { fetchImpl: down, sleep: noWait, now: clock() }),
    ).rejects.toBeInstanceOf(CatalogSourceError);

    // El músculo que falló se reintentará en el siguiente disparo del cron, no se salta.
    const status = await readCatalogSyncStatus(db);
    expect(status?.nextMuscle).toBe('abs');
  });

  it('guarda el texto de búsqueda normalizado de los dos idiomas', async () => {
    const cdn = createCatalogFetch();
    const clock = createClock('2026-09-08T10:00:00.000Z');
    await runFullCycle(db, cdn.fetch, clock);

    const [bench] = await db
      .select()
      .from(catalogExercise)
      .where(eq(catalogExercise.catalogId, 'pectorals/barbell-bench-press'));

    expect(bench?.searchText).toBe('press de banca con barra barbell bench press');
    expect(bench?.bodyPart).toBe('chest');
    expect(bench?.secondaryMuscles).toEqual(['triceps', 'delts']);
  });

  it('no deja estado antes del primer paso', async () => {
    expect(await readCatalogSyncStatus(db)).toBeNull();
  });
});
