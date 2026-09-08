import {
  muscleSchema,
  type CatalogSyncStatus,
  type CatalogSyncStep,
  type Muscle,
} from '@gymbuddy/shared';
import { count, eq, lt, sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { catalogExercise, catalogSyncState, type NewCatalogExerciseRow } from '../db/schema';
import { fetchMuscleFile, type CatalogClientOptions } from './client';
import { buildCatalogRows } from './snapshot';
import { CATALOG_VERSION } from './source';

/** El orden en el que se recorren los músculos. Es estable: el puntero del ciclo depende de él. */
export const SYNC_MUSCLE_ORDER: readonly Muscle[] = muscleSchema.options;

/** La fila de estado es única; su clave primaria es esta constante. */
const SYNC_STATE_ID = 'catalog';

/**
 * `catalog_exercise` tiene dieciséis columnas y D1 admite cien parámetros por consulta,
 * así que en cada sentencia caben seis filas. El músculo más grande son 169 ejercicios:
 * veintiocho sentencias que salen en un único `batch`, es decir, un solo viaje a la base.
 */
const ROWS_PER_STATEMENT = 6;

export interface CatalogSyncOptions extends CatalogClientOptions {
  /** Momento del paso. Se inyecta para que los tests no dependan del reloj. */
  readonly now?: Date;
  /** Rearranca el ciclo desde el primer músculo aunque el anterior hubiese terminado. */
  readonly force?: boolean;
}

/**
 * Avanza la sincronización del catálogo **un músculo**. No es una limitación del catálogo
 * sino del runtime: con 10 ms de CPU por invocación en el plan gratuito, traer y validar
 * los 1323 ejercicios de una vez no cabe. La API de origen ya viene partida por músculo,
 * así que el troceado sale gratis (ver `CLAUDE.md` §4).
 *
 * Es idempotente: cada fila entra con `insert ... on conflict do update`, así que repetir
 * un músculo deja la base exactamente igual.
 */
export async function runCatalogSyncStep(
  db: Database,
  options: CatalogSyncOptions = {},
): Promise<CatalogSyncStep> {
  const now = (options.now ?? new Date()).toISOString();
  const state = await readSyncState(db);
  const cycle = resolveCycle(state, now, options.force ?? false);

  if (cycle.nextMuscle === null) {
    // El ciclo ya está completo y el tag no ha cambiado: el catálogo es inmutable, así que
    // volver a descargarlo no traería nada nuevo. El cron pasa de largo sin gastar red.
    return {
      syncedMuscle: null,
      exercisesUpserted: 0,
      staleExercisesRemoved: 0,
      status: await describe(db, cycle),
    };
  }

  const muscle = cycle.nextMuscle;
  const [spanish, english] = await Promise.all([
    fetchMuscleFile(muscle, 'es', options),
    fetchMuscleFile(muscle, 'en', options),
  ]);

  const { rows, skipped } = buildCatalogRows({
    muscle,
    spanish,
    english,
    catalogVersion: cycle.catalogVersion,
    syncedAt: now,
  });

  if (skipped.length > 0) {
    // No hay más rastro en el edge que este log, y un descarte silencioso sería un
    // ejercicio que desaparece de la app sin que nadie sepa por qué.
    console.warn(`Catálogo: ${String(skipped.length)} ejercicios descartados`, skipped);
  }

  await upsertCatalogRows(db, rows);

  const nextMuscle = muscleAfter(muscle);
  const staleExercisesRemoved =
    nextMuscle === null ? await removeStaleExercises(db, cycle.startedAt) : 0;

  const status: CatalogSyncStatus = {
    catalogVersion: cycle.catalogVersion,
    startedAt: cycle.startedAt,
    updatedAt: now,
    completedAt: nextMuscle === null ? now : null,
    nextMuscle,
    exerciseCount: await countCatalogExercises(db),
  };

  await writeSyncState(db, status);

  return { syncedMuscle: muscle, exercisesUpserted: rows.length, staleExercisesRemoved, status };
}

/** El estado actual del snapshot, sin tocar el origen. Lo usan la ruta de administración y los tests. */
export async function readCatalogSyncStatus(db: Database): Promise<CatalogSyncStatus | null> {
  const state = await readSyncState(db);
  if (state === null) return null;

  return {
    catalogVersion: state.catalogVersion,
    startedAt: state.startedAt,
    updatedAt: state.updatedAt,
    completedAt: state.completedAt,
    nextMuscle: state.nextMuscle === null ? null : muscleSchema.parse(state.nextMuscle),
    exerciseCount: await countCatalogExercises(db),
  };
}

/** Deja constancia de un fallo del origen sin mover el puntero: el músculo se reintentará. */
export async function recordCatalogSyncFailure(
  db: Database,
  message: string,
  at: Date = new Date(),
): Promise<void> {
  await db
    .update(catalogSyncState)
    .set({ lastError: message, updatedAt: at.toISOString() })
    .where(eq(catalogSyncState.id, SYNC_STATE_ID));
}

interface SyncCycle {
  readonly catalogVersion: string;
  readonly startedAt: string;
  readonly nextMuscle: Muscle | null;
}

/**
 * Decide en qué punto del ciclo estamos. Se arranca uno nuevo cuando no hay estado, cuando
 * el tag del catálogo cambió (subir de versión es lo único que invalida el snapshot) o
 * cuando se fuerza a mano. Si el ciclo terminó y el tag sigue igual, no hay nada que hacer.
 */
function resolveCycle(
  state: { catalogVersion: string; startedAt: string; nextMuscle: string | null } | null,
  now: string,
  force: boolean,
): SyncCycle {
  const firstMuscle = SYNC_MUSCLE_ORDER[0];
  if (firstMuscle === undefined) throw new Error('El catálogo no declara ningún músculo');

  if (state === null || force || state.catalogVersion !== CATALOG_VERSION) {
    return { catalogVersion: CATALOG_VERSION, startedAt: now, nextMuscle: firstMuscle };
  }

  return {
    catalogVersion: state.catalogVersion,
    startedAt: state.startedAt,
    nextMuscle: state.nextMuscle === null ? null : muscleSchema.parse(state.nextMuscle),
  };
}

function muscleAfter(muscle: Muscle): Muscle | null {
  const index = SYNC_MUSCLE_ORDER.indexOf(muscle);
  return SYNC_MUSCLE_ORDER[index + 1] ?? null;
}

async function readSyncState(db: Database) {
  const [state] = await db
    .select()
    .from(catalogSyncState)
    .where(eq(catalogSyncState.id, SYNC_STATE_ID))
    .limit(1);

  return state ?? null;
}

async function writeSyncState(db: Database, status: CatalogSyncStatus): Promise<void> {
  await db
    .insert(catalogSyncState)
    .values({
      id: SYNC_STATE_ID,
      catalogVersion: status.catalogVersion,
      nextMuscle: status.nextMuscle,
      startedAt: status.startedAt,
      updatedAt: status.updatedAt,
      completedAt: status.completedAt,
      lastError: null,
    })
    .onConflictDoUpdate({
      target: catalogSyncState.id,
      set: {
        catalogVersion: status.catalogVersion,
        nextMuscle: status.nextMuscle,
        startedAt: status.startedAt,
        updatedAt: status.updatedAt,
        completedAt: status.completedAt,
        // Un paso correcto limpia el fallo anterior: si no, un corte puntual quedaría
        // colgado en el estado para siempre.
        lastError: null,
      },
    });
}

async function describe(db: Database, cycle: SyncCycle): Promise<CatalogSyncStatus> {
  const state = await readSyncState(db);

  return {
    catalogVersion: cycle.catalogVersion,
    startedAt: cycle.startedAt,
    updatedAt: state?.updatedAt ?? cycle.startedAt,
    completedAt: state?.completedAt ?? null,
    nextMuscle: cycle.nextMuscle,
    exerciseCount: await countCatalogExercises(db),
  };
}

/**
 * Sube las filas de un músculo en lotes que respetan el límite de parámetros de D1. El
 * `on conflict do update` es lo que hace la sincronización repetible: la clave primaria es
 * el `catalogId` del origen, así que un músculo ya sincronizado se reescribe sobre sí mismo.
 */
async function upsertCatalogRows(db: Database, rows: NewCatalogExerciseRow[]): Promise<void> {
  const statements = [];

  for (let index = 0; index < rows.length; index += ROWS_PER_STATEMENT) {
    const chunk = rows.slice(index, index + ROWS_PER_STATEMENT);
    statements.push(
      db
        .insert(catalogExercise)
        .values(chunk)
        .onConflictDoUpdate({
          target: catalogExercise.catalogId,
          set: {
            slug: sql`excluded.slug`,
            muscle: sql`excluded.muscle`,
            bodyPart: sql`excluded.body_part`,
            equipment: sql`excluded.equipment`,
            category: sql`excluded.category`,
            secondaryMuscles: sql`excluded.secondary_muscles`,
            gifUrl: sql`excluded.gif_url`,
            nameEs: sql`excluded.name_es`,
            nameEn: sql`excluded.name_en`,
            instructionsEs: sql`excluded.instructions_es`,
            instructionsEn: sql`excluded.instructions_en`,
            searchText: sql`excluded.search_text`,
            catalogVersion: sql`excluded.catalog_version`,
            syncedAt: sql`excluded.synced_at`,
          },
        }),
    );
  }

  const [first, ...rest] = statements;
  if (first === undefined) return;

  // Un solo viaje a D1 para todo el músculo: el coste de red domina sobre el de la consulta.
  await db.batch([first, ...rest]);
}

/**
 * Borra lo que el ciclo no ha vuelto a tocar, es decir, los ejercicios que el catálogo ya
 * no publica. La referencia desde "mis ejercicios" se anula sola (`on delete set null`), de
 * modo que el historial del usuario sobrevive a la desaparición de un ejercicio del origen.
 */
async function removeStaleExercises(db: Database, cycleStartedAt: string): Promise<number> {
  const stale = await db
    .delete(catalogExercise)
    .where(lt(catalogExercise.syncedAt, cycleStartedAt))
    .returning({ catalogId: catalogExercise.catalogId });

  return stale.length;
}

async function countCatalogExercises(db: Database): Promise<number> {
  const [row] = await db.select({ total: count() }).from(catalogExercise);
  return row?.total ?? 0;
}
