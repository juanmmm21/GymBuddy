import {
  bodyPartSchema,
  formatGramsAsKilograms,
  muscleSchema,
  type BodyPart,
  type CreateTrackedExerciseRequest,
  type LastSet,
  type Locale,
  type Muscle,
  type TrackedExercise,
  type UpdateTrackedExerciseRequest,
} from '@gymbuddy/shared';
import { and, eq, getTableColumns, isNull, max } from 'drizzle-orm';
import type { Database } from '../db/client';
import { catalogExercise, setEntry, trackedExercise, type TrackedExerciseRow } from '../db/schema';
import { ApiException } from '../http/errors';

/** Los campos del catálogo que hacen falta para pintar la ficha de un ejercicio seguido. */
const catalogColumns = {
  nameEs: catalogExercise.nameEs,
  nameEn: catalogExercise.nameEn,
  muscle: catalogExercise.muscle,
  bodyPart: catalogExercise.bodyPart,
  gifUrl: catalogExercise.gifUrl,
};

type CatalogFields = { [K in keyof typeof catalogColumns]: string };

interface TrackedExerciseJoin {
  readonly exercise: TrackedExerciseRow;
  readonly catalog: CatalogFields | null;
}

export interface ListTrackedExercisesOptions {
  readonly locale: Locale;
  readonly includeArchived: boolean;
}

/**
 * "Mis ejercicios": los que el usuario hace de verdad, con el peso de la última serie
 * efectiva para precargarlo. El peso habitual (la mediana de las últimas sesiones) es
 * lógica de dominio y llega en la fase 6; esto es el dato en bruto que ya está guardado.
 */
export async function listTrackedExercises(
  db: Database,
  userId: string,
  options: ListTrackedExercisesOptions,
): Promise<TrackedExercise[]> {
  const filter = options.includeArchived
    ? eq(trackedExercise.userId, userId)
    : and(eq(trackedExercise.userId, userId), isNull(trackedExercise.archivedAt));

  const [rows, lastSets] = await Promise.all([
    db
      .select({ exercise: getTableColumns(trackedExercise), catalog: catalogColumns })
      .from(trackedExercise)
      .leftJoin(catalogExercise, eq(trackedExercise.catalogId, catalogExercise.catalogId))
      .where(filter)
      .orderBy(trackedExercise.createdAt),
    findLastSetsByExercise(db, userId),
  ]);

  return rows.map((row) => toTrackedExercise(row, options.locale, lastSets.get(row.exercise.id)));
}

export async function findTrackedExercise(
  db: Database,
  userId: string,
  exerciseId: string,
  locale: Locale,
): Promise<TrackedExercise | null> {
  const row = await findTrackedExerciseJoin(db, userId, exerciseId);
  if (row === null) return null;

  const lastSets = await findLastSetsByExercise(db, userId, exerciseId);

  return toTrackedExercise(row, locale, lastSets.get(exerciseId));
}

/**
 * Da de alta un ejercicio. El identificador llega del cliente, así que reenviar el alta
 * tiene que devolver la misma ficha en vez de crear otra: `on conflict do nothing` deja
 * esa decisión en la base y no en una lectura previa que dos peticiones a la vez ganarían.
 */
export async function createTrackedExercise(
  db: Database,
  userId: string,
  request: CreateTrackedExerciseRequest,
  locale: Locale,
  now: Date,
): Promise<{ exercise: TrackedExercise; created: boolean }> {
  if (request.origin === 'catalog') {
    await assertCatalogExerciseExists(db, request.catalogId);
    await assertCatalogExerciseNotTracked(db, userId, request.catalogId, request.id);
  }

  const row: TrackedExerciseRow = {
    id: request.id,
    userId,
    catalogId: request.origin === 'catalog' ? request.catalogId : null,
    customName: request.origin === 'custom' ? request.name : null,
    customMuscle: request.origin === 'custom' ? (request.muscle ?? null) : null,
    customBodyPart: request.origin === 'custom' ? (request.bodyPart ?? null) : null,
    notes: request.notes ?? null,
    createdAt: now.toISOString(),
    archivedAt: null,
  };

  const inserted = await db
    .insert(trackedExercise)
    .values(row)
    .onConflictDoNothing({ target: trackedExercise.id })
    .returning();

  if (inserted.length > 0) {
    const created = await findTrackedExercise(db, userId, row.id, locale);
    if (created === null) {
      throw new Error(`El ejercicio ${row.id} desapareció justo después de crearse`);
    }

    return { exercise: created, created: true };
  }

  // El identificador ya estaba. Si describe lo mismo es un reenvío de la cola offline y se
  // responde lo que hay; si describe otra cosa, alguien reutilizó un UUID y hay que avisar.
  const existing = await findTrackedExerciseJoin(db, userId, row.id);
  if (existing === null) {
    throw new ApiException('conflicting_write', 'Ese identificador de ejercicio ya está en uso', {
      id: row.id,
    });
  }

  if (!describesSameExercise(existing.exercise, row)) {
    throw new ApiException('conflicting_write', 'Ese ejercicio ya existe con otros datos', {
      id: row.id,
    });
  }

  const lastSets = await findLastSetsByExercise(db, userId, row.id);

  return { exercise: toTrackedExercise(existing, locale, lastSets.get(row.id)), created: false };
}

/** Cambia las notas y archiva o recupera. La baja es blanda: borrar se llevaría el historial. */
export async function updateTrackedExercise(
  db: Database,
  userId: string,
  exerciseId: string,
  request: UpdateTrackedExerciseRequest,
  locale: Locale,
  now: Date,
): Promise<TrackedExercise> {
  const changes: Partial<TrackedExerciseRow> = {};
  if (request.notes !== undefined) changes.notes = request.notes;
  if (request.archived !== undefined) {
    changes.archivedAt = request.archived ? now.toISOString() : null;
  }

  if (Object.keys(changes).length > 0) {
    const updated = await db
      .update(trackedExercise)
      .set(changes)
      .where(and(eq(trackedExercise.id, exerciseId), eq(trackedExercise.userId, userId)))
      .returning();

    if (updated.length === 0) throw exerciseNotFound(exerciseId);
  }

  const exercise = await findTrackedExercise(db, userId, exerciseId, locale);
  if (exercise === null) throw exerciseNotFound(exerciseId);

  return exercise;
}

/** El ejercicio existe y es de este usuario. Lo usan las series antes de registrar nada. */
export async function assertTrackedExerciseBelongsToUser(
  db: Database,
  userId: string,
  exerciseId: string,
): Promise<void> {
  const [row] = await db
    .select({ id: trackedExercise.id })
    .from(trackedExercise)
    .where(and(eq(trackedExercise.id, exerciseId), eq(trackedExercise.userId, userId)))
    .limit(1);

  if (row === undefined) throw exerciseNotFound(exerciseId);
}

export function exerciseNotFound(exerciseId: string): ApiException {
  return new ApiException('not_found', `No existe el ejercicio "${exerciseId}"`);
}

/**
 * La última serie efectiva de cada ejercicio del usuario, en dos pasos dentro de la misma
 * consulta: primero el momento más reciente por ejercicio, luego la fila que lo tiene. El
 * calentamiento queda fuera porque no es lo que se quiere precargar la próxima vez.
 */
async function findLastSetsByExercise(
  db: Database,
  userId: string,
  exerciseId?: string,
): Promise<Map<string, LastSet>> {
  const scope = and(
    eq(trackedExercise.userId, userId),
    eq(setEntry.isWarmup, false),
    exerciseId === undefined ? undefined : eq(setEntry.trackedExerciseId, exerciseId),
  );

  const latest = db
    .select({
      trackedExerciseId: setEntry.trackedExerciseId,
      lastCompletedAt: max(setEntry.completedAt).as('last_completed_at'),
    })
    .from(setEntry)
    .innerJoin(trackedExercise, eq(trackedExercise.id, setEntry.trackedExerciseId))
    .where(scope)
    .groupBy(setEntry.trackedExerciseId)
    .as('latest');

  const rows = await db
    .select({
      trackedExerciseId: setEntry.trackedExerciseId,
      orderIndex: setEntry.orderIndex,
      weightGrams: setEntry.weightGrams,
      reps: setEntry.reps,
      completedAt: setEntry.completedAt,
    })
    .from(setEntry)
    .innerJoin(
      latest,
      and(
        eq(setEntry.trackedExerciseId, latest.trackedExerciseId),
        eq(setEntry.completedAt, latest.lastCompletedAt),
      ),
    )
    .where(eq(setEntry.isWarmup, false));

  const lastSets = new Map<string, LastSet>();
  const orderByExercise = new Map<string, number>();

  for (const row of rows) {
    // Dos series pueden compartir el instante exacto (el bot registra en lotes): manda la
    // que se anotó después dentro de la sesión.
    const previous = orderByExercise.get(row.trackedExerciseId);
    if (previous !== undefined && previous >= row.orderIndex) continue;

    orderByExercise.set(row.trackedExerciseId, row.orderIndex);
    lastSets.set(row.trackedExerciseId, {
      weight: formatGramsAsKilograms(row.weightGrams),
      reps: row.reps,
      completedAt: row.completedAt,
    });
  }

  return lastSets;
}

async function findTrackedExerciseJoin(
  db: Database,
  userId: string,
  exerciseId: string,
): Promise<TrackedExerciseJoin | null> {
  const [row] = await db
    .select({ exercise: getTableColumns(trackedExercise), catalog: catalogColumns })
    .from(trackedExercise)
    .leftJoin(catalogExercise, eq(trackedExercise.catalogId, catalogExercise.catalogId))
    .where(and(eq(trackedExercise.id, exerciseId), eq(trackedExercise.userId, userId)))
    .limit(1);

  return row ?? null;
}

/**
 * Seguir dos veces el mismo ejercicio del catálogo partiría su historial en dos fichas. La
 * base ya lo impide con un índice único parcial; aquí se traduce a un código que la PWA
 * entiende, en vez de dejar salir el fallo de la restricción como error interno.
 */
async function assertCatalogExerciseNotTracked(
  db: Database,
  userId: string,
  catalogId: string,
  requestedId: string,
): Promise<void> {
  const [existing] = await db
    .select({ id: trackedExercise.id })
    .from(trackedExercise)
    .where(and(eq(trackedExercise.userId, userId), eq(trackedExercise.catalogId, catalogId)))
    .limit(1);

  if (existing !== undefined && existing.id !== requestedId) {
    throw new ApiException(
      'exercise_already_tracked',
      'Ese ejercicio del catálogo ya está en tus ejercicios',
      { trackedExerciseId: existing.id },
    );
  }
}

/**
 * El catálogo se puebla por sincronización, así que un `catalogId` desconocido es un 404
 * y no un fallo de clave ajena: puede ser un identificador viejo de una versión anterior.
 */
async function assertCatalogExerciseExists(db: Database, catalogId: string): Promise<void> {
  const [row] = await db
    .select({ catalogId: catalogExercise.catalogId })
    .from(catalogExercise)
    .where(eq(catalogExercise.catalogId, catalogId))
    .limit(1);

  if (row === undefined) {
    throw new ApiException('not_found', `No existe el ejercicio "${catalogId}" en el catálogo`);
  }
}

function describesSameExercise(stored: TrackedExerciseRow, incoming: TrackedExerciseRow): boolean {
  return (
    stored.catalogId === incoming.catalogId &&
    stored.customName === incoming.customName &&
    stored.customMuscle === incoming.customMuscle &&
    stored.customBodyPart === incoming.customBodyPart
  );
}

function toTrackedExercise(
  row: TrackedExerciseJoin,
  locale: Locale,
  lastSet: LastSet | undefined,
): TrackedExercise {
  const { exercise, catalog } = row;
  const fromCatalog = exercise.catalogId !== null && catalog !== null;

  return {
    id: exercise.id,
    name: fromCatalog
      ? locale === 'es'
        ? catalog.nameEs
        : catalog.nameEn
      : (exercise.customName ?? ''),
    origin: exercise.catalogId === null ? 'custom' : 'catalog',
    catalogId: exercise.catalogId,
    muscle: parseNullableMuscle(fromCatalog ? catalog.muscle : exercise.customMuscle),
    bodyPart: parseNullableBodyPart(fromCatalog ? catalog.bodyPart : exercise.customBodyPart),
    gifUrl: fromCatalog ? catalog.gifUrl : null,
    notes: exercise.notes,
    lastSet: lastSet ?? null,
    createdAt: exercise.createdAt,
    archivedAt: exercise.archivedAt,
  };
}

/**
 * `muscle` y `body_part` son texto en SQLite y se validan al salir, igual que en el
 * catálogo: un valor corrupto tiene que verse como un 500 aquí y no como una pantalla
 * rota en la PWA. Lo que entra ya pasó por el mismo enum de `@gymbuddy/shared`.
 */
function parseNullableMuscle(value: string | null): Muscle | null {
  return value === null ? null : muscleSchema.parse(value);
}

function parseNullableBodyPart(value: string | null): BodyPart | null {
  return value === null ? null : bodyPartSchema.parse(value);
}
