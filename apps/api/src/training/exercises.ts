import {
  WORKING_WEIGHT_SESSIONS,
  bodyPartSchema,
  formatGramsAsKilograms,
  muscleSchema,
  summarizeWorkingWeight,
  type BodyPart,
  type CreateTrackedExerciseRequest,
  type Locale,
  type Muscle,
  type SessionTopSet,
  type TrackedExercise,
  type UpdateTrackedExerciseRequest,
  type WorkingWeight,
} from '@gymbuddy/shared';
import { and, eq, getTableColumns, inArray, isNull } from 'drizzle-orm';
import type { Database } from '../db/client';
import { listTopSetsPerSession } from '../db/queries';
import { catalogExercise, trackedExercise, type TrackedExerciseRow } from '../db/schema';
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
 * "Mis ejercicios": los que el usuario hace de verdad, cada uno con su peso habitual —la
 * mediana de la serie más pesada de las últimas cinco sesiones—, que es lo que precarga la
 * pantalla y lo que responde a "¿cuánto suelo levantar aquí?".
 */
export async function listTrackedExercises(
  db: Database,
  userId: string,
  options: ListTrackedExercisesOptions,
): Promise<TrackedExercise[]> {
  const filter = options.includeArchived
    ? eq(trackedExercise.userId, userId)
    : and(eq(trackedExercise.userId, userId), isNull(trackedExercise.archivedAt));

  const [rows, workingWeights] = await Promise.all([
    db
      .select({ exercise: getTableColumns(trackedExercise), catalog: catalogColumns })
      .from(trackedExercise)
      .leftJoin(catalogExercise, eq(trackedExercise.catalogId, catalogExercise.catalogId))
      .where(filter)
      .orderBy(trackedExercise.createdAt),
    findWorkingWeightsByExercise(db, userId),
  ]);

  return rows.map((row) =>
    toTrackedExercise(row, options.locale, workingWeights.get(row.exercise.id)),
  );
}

export async function findTrackedExercise(
  db: Database,
  userId: string,
  exerciseId: string,
  locale: Locale,
): Promise<TrackedExercise | null> {
  const row = await findTrackedExerciseJoin(db, userId, exerciseId);
  if (row === null) return null;

  const workingWeights = await findWorkingWeightsByExercise(db, userId, exerciseId);

  return toTrackedExercise(row, locale, workingWeights.get(exerciseId));
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

  const workingWeights = await findWorkingWeightsByExercise(db, userId, row.id);

  return {
    exercise: toTrackedExercise(existing, locale, workingWeights.get(row.id)),
    created: false,
  };
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

/** Lo que las estadísticas necesitan saber de un ejercicio sin traerse su ficha entera. */
export interface TrackedExerciseFacts {
  readonly bodyPart: BodyPart | null;
  readonly archived: boolean;
}

/**
 * La parte del cuerpo de varios ejercicios de golpe, resuelta ya contra el catálogo. Es lo
 * que decide el incremento sugerido al detectar estancamiento, y va en una sola consulta
 * porque la señal puede afectar a varios ejercicios a la vez.
 */
export async function listTrackedExerciseFacts(
  db: Database,
  userId: string,
  exerciseIds: readonly string[],
): Promise<Map<string, TrackedExerciseFacts>> {
  if (exerciseIds.length === 0) return new Map();

  const rows = await db
    .select({
      id: trackedExercise.id,
      catalogBodyPart: catalogExercise.bodyPart,
      customBodyPart: trackedExercise.customBodyPart,
      archivedAt: trackedExercise.archivedAt,
    })
    .from(trackedExercise)
    .leftJoin(catalogExercise, eq(trackedExercise.catalogId, catalogExercise.catalogId))
    .where(and(eq(trackedExercise.userId, userId), inArray(trackedExercise.id, [...exerciseIds])));

  return new Map(
    rows.map((row) => [
      row.id,
      {
        bodyPart: parseNullableBodyPart(row.catalogBodyPart ?? row.customBodyPart),
        archived: row.archivedAt !== null,
      },
    ]),
  );
}

/** Igual, para un solo ejercicio, exigiendo que exista y sea de este usuario. */
export async function requireTrackedExerciseFacts(
  db: Database,
  userId: string,
  exerciseId: string,
): Promise<TrackedExerciseFacts> {
  const facts = (await listTrackedExerciseFacts(db, userId, [exerciseId])).get(exerciseId);
  if (facts === undefined) throw exerciseNotFound(exerciseId);

  return facts;
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
 * El peso habitual de cada ejercicio del usuario. La consulta trae la serie más pesada de
 * las cinco últimas sesiones de cada ejercicio —cinco filas por ejercicio, no su historial
 * entero— y la mediana la calcula el dominio, que es quien define qué es "lo habitual".
 */
async function findWorkingWeightsByExercise(
  db: Database,
  userId: string,
  exerciseId?: string,
): Promise<Map<string, WorkingWeight>> {
  const rows = await listTopSetsPerSession(db, userId, WORKING_WEIGHT_SESSIONS, exerciseId);

  const topSetsByExercise = new Map<string, SessionTopSet[]>();
  for (const row of rows) {
    const entry: SessionTopSet = {
      sessionId: row.sessionId,
      startedAt: row.startedAt,
      weightGrams: row.weightGrams,
      reps: row.reps,
    };

    const existing = topSetsByExercise.get(row.trackedExerciseId);
    if (existing === undefined) {
      topSetsByExercise.set(row.trackedExerciseId, [entry]);
    } else {
      existing.push(entry);
    }
  }

  const workingWeights = new Map<string, WorkingWeight>();
  for (const [trackedExerciseId, topSets] of topSetsByExercise) {
    const summary = summarizeWorkingWeight(topSets, WORKING_WEIGHT_SESSIONS);
    if (summary === null) continue;

    workingWeights.set(trackedExerciseId, {
      weight: formatGramsAsKilograms(summary.weightGrams),
      reps: summary.reps,
      lastPerformedAt: summary.lastPerformedAt,
      sessionCount: summary.sessionCount,
    });
  }

  return workingWeights;
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
  workingWeight: WorkingWeight | undefined,
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
    workingWeight: workingWeight ?? null,
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
