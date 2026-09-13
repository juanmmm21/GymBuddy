import {
  deriveImportedIds,
  findCatalogConflicts,
  importedIdOf,
  importedSessionEndedAt,
  parseKilogramsToGrams,
  parseVolumeKilogramsToGrams,
  rpeToTenths,
  type ExportedExercise,
  type ExportedRoutine,
  type ExportedSession,
  type ImportExercisesResponse,
} from '@gymbuddy/shared';
import type { BatchItem } from 'drizzle-orm/batch';
import { and, eq, inArray } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { Database } from '../db/client';
import {
  catalogExercise,
  personalRecord,
  routine,
  routineItem,
  setEntry,
  trackedExercise,
  workoutSession,
  type NewPersonalRecordRow,
  type NewRoutineItemRow,
  type NewRoutineRow,
  type NewSetEntryRow,
  type NewTrackedExerciseRow,
  type NewWorkoutSessionRow,
} from '../db/schema';
import { ApiException } from '../http/errors';

/*
 * Importar una copia de seguridad, por lotes que la PWA sube uno detrás de otro: ejercicios,
 * rutinas y sesiones. Cada fila entra con el id derivado del usuario de destino
 * (`deriveImportedId`), nunca con el del fichero, y con `on conflict do nothing` sobre la clave
 * primaria: repetir un lote o reanudar una importación a medias no duplica ni reescribe nada.
 */

/** D1 no admite más de cien parámetros por consulta; se deja uno libre para el `user_id`. */
const MAX_PARAMS_PER_LOOKUP = 90;

/** Filas por sentencia de inserción según las columnas de cada tabla, bajo los cien parámetros. */
const ROWS_PER_INSERT = {
  trackedExercise: 11, // 9 columnas
  routine: 16, // 6 columnas
  routineItem: 14, // 7 columnas
  workoutSession: 20, // 5 columnas
  setEntry: 11, // 9 columnas
  personalRecord: 14, // 7 columnas
} as const;

/**
 * Sube un lote de ejercicios. Uno del catálogo que la cuenta de destino no tiene sincronizado
 * entra como propio con el nombre, el músculo y la parte del cuerpo del fichero —la clave ajena
 * no dejaría guardarlo, y perderlo se llevaría sus series—, y se devuelve en `enteredAsCustom`.
 *
 * Si la cuenta ya sigue alguno de esos ejercicios del catálogo con otra ficha, no se escribe
 * nada del lote: fusionar dos historiales es otra decisión, y a medias sería peor.
 */
export async function importExercises(
  db: Database,
  userId: string,
  exercises: readonly ExportedExercise[],
): Promise<ImportExercisesResponse> {
  const importedIds = await deriveImportedIds(
    userId,
    exercises.map((exercise) => exercise.id),
  );
  await assertIdsFree(db, userId, trackedExercise, trackedExercise.id, trackedExercise.userId, [
    ...importedIds.values(),
  ]);

  const catalogIds = exercises.flatMap((exercise) =>
    exercise.catalogId === null ? [] : [exercise.catalogId],
  );
  const { available, following } = await readCatalogSituation(db, userId, catalogIds);

  const conflicts = findCatalogConflicts(exercises, following, importedIds);
  if (conflicts.length > 0) {
    throw new ApiException(
      'import_conflict',
      'Ya sigues algún ejercicio de la copia con otra ficha',
      { catalogIds: conflicts },
    );
  }

  const enteredAsCustom: string[] = [];
  const rows = exercises.map((exercise): NewTrackedExerciseRow => {
    const linked = exercise.catalogId !== null && available.has(exercise.catalogId);
    if (exercise.catalogId !== null && !linked) enteredAsCustom.push(exercise.catalogId);

    return {
      id: importedIdOf(importedIds, exercise.id),
      userId,
      catalogId: linked ? exercise.catalogId : null,
      customName: linked ? null : exercise.name,
      customMuscle: linked ? null : exercise.muscle,
      customBodyPart: linked ? null : exercise.bodyPart,
      notes: exercise.notes,
      createdAt: exercise.createdAt,
      archivedAt: exercise.archivedAt,
    };
  });

  await runBatch(
    db,
    chunk(rows, ROWS_PER_INSERT.trackedExercise).map((values) =>
      db.insert(trackedExercise).values(values).onConflictDoNothing({ target: trackedExercise.id }),
    ),
  );

  return { enteredAsCustom };
}

/** Sube un lote de rutinas con sus líneas. Los ejercicios que nombran tienen que haber entrado ya. */
export async function importRoutines(
  db: Database,
  userId: string,
  routines: readonly ExportedRoutine[],
): Promise<void> {
  const items = routines.flatMap((entry) => entry.items);
  const importedIds = await deriveImportedIds(userId, [
    ...routines.map((entry) => entry.id),
    ...items.map((item) => item.id),
    ...items.map((item) => item.trackedExerciseId),
  ]);

  await assertIdsFree(
    db,
    userId,
    routine,
    routine.id,
    routine.userId,
    routines.map((entry) => importedIdOf(importedIds, entry.id)),
  );
  await assertExercisesImported(
    db,
    userId,
    items.map((item) => importedIdOf(importedIds, item.trackedExerciseId)),
  );

  const routineRows = routines.map((entry): NewRoutineRow => ({
    id: importedIdOf(importedIds, entry.id),
    userId,
    name: entry.name,
    description: entry.description,
    createdAt: entry.createdAt,
    archivedAt: entry.archivedAt,
  }));
  const itemRows = routines.flatMap((entry) =>
    entry.items.map((item): NewRoutineItemRow => ({
      id: importedIdOf(importedIds, item.id),
      routineId: importedIdOf(importedIds, entry.id),
      trackedExerciseId: importedIdOf(importedIds, item.trackedExerciseId),
      orderIndex: item.orderIndex,
      targetSets: item.targetSets,
      targetRepsMin: item.targetRepsMin,
      targetRepsMax: item.targetRepsMax,
    })),
  );

  // Un solo `batch`, que en D1 es una transacción: una línea no puede quedar sin su rutina.
  await runBatch(db, [
    ...chunk(routineRows, ROWS_PER_INSERT.routine).map((values) =>
      db.insert(routine).values(values).onConflictDoNothing({ target: routine.id }),
    ),
    ...chunk(itemRows, ROWS_PER_INSERT.routineItem).map((values) =>
      db.insert(routineItem).values(values).onConflictDoNothing({ target: routineItem.id }),
    ),
  ]);
}

/**
 * Sube un lote de sesiones con sus series y las marcas de cada serie. Las marcas se copian tal
 * cual y no se recalculan: son la historia de cada vez que se superó una, y recalcularlas sobre
 * años de series no cabe en los 10 ms de CPU de una invocación.
 */
export async function importSessions(
  db: Database,
  userId: string,
  sessions: readonly ExportedSession[],
): Promise<void> {
  const sets = sessions.flatMap((session) => session.sets);
  const importedIds = await deriveImportedIds(userId, [
    ...sessions.map((session) => session.id),
    ...sets.map((set) => set.id),
    ...sets.map((set) => set.trackedExerciseId),
    ...sets.flatMap((set) => set.records.map((record) => record.id)),
  ]);

  await assertIdsFree(
    db,
    userId,
    workoutSession,
    workoutSession.id,
    workoutSession.userId,
    sessions.map((session) => importedIdOf(importedIds, session.id)),
  );
  await assertExercisesImported(
    db,
    userId,
    sets.map((set) => importedIdOf(importedIds, set.trackedExerciseId)),
  );

  const sessionRows: NewWorkoutSessionRow[] = [];
  const setRows: NewSetEntryRow[] = [];
  const recordRows: NewPersonalRecordRow[] = [];

  for (const session of sessions) {
    const sessionId = importedIdOf(importedIds, session.id);
    sessionRows.push({
      id: sessionId,
      userId,
      startedAt: session.startedAt,
      endedAt: importedSessionEndedAt(session),
      notes: session.notes,
    });

    for (const set of session.sets) {
      const setId = importedIdOf(importedIds, set.id);
      const exerciseId = importedIdOf(importedIds, set.trackedExerciseId);
      setRows.push({
        id: setId,
        sessionId,
        trackedExerciseId: exerciseId,
        orderIndex: set.orderIndex,
        weightGrams: toGrams(parseKilogramsToGrams, set.weight, set.id),
        reps: set.reps,
        rpeTenths: set.rpe === null ? null : rpeToTenths(set.rpe),
        isWarmup: set.isWarmup,
        completedAt: set.completedAt,
      });

      for (const record of set.records) {
        recordRows.push({
          id: importedIdOf(importedIds, record.id),
          userId,
          trackedExerciseId: exerciseId,
          kind: record.kind,
          valueGrams: toGrams(parseVolumeKilogramsToGrams, record.value, record.id),
          setEntryId: setId,
          achievedAt: record.achievedAt,
        });
      }
    }
  }

  // En este orden y en un solo `batch`: una serie no puede quedar sin su sesión ni una marca
  // sin su serie, y si algo falla, D1 deshace el lote entero.
  await runBatch(db, [
    ...chunk(sessionRows, ROWS_PER_INSERT.workoutSession).map((values) =>
      db.insert(workoutSession).values(values).onConflictDoNothing({ target: workoutSession.id }),
    ),
    ...chunk(setRows, ROWS_PER_INSERT.setEntry).map((values) =>
      db.insert(setEntry).values(values).onConflictDoNothing({ target: setEntry.id }),
    ),
    ...chunk(recordRows, ROWS_PER_INSERT.personalRecord).map((values) =>
      db.insert(personalRecord).values(values).onConflictDoNothing({ target: personalRecord.id }),
    ),
  ]);
}

/**
 * Los ids derivados que ya existen tienen que ser de este usuario. Que otra cuenta tenga uno
 * solo pasa si alguien lo fabricó a propósito con los ids de esta copia, y entonces
 * `on conflict do nothing` colgaría las series de esta cuenta de una sesión ajena.
 */
async function assertIdsFree(
  db: Database,
  userId: string,
  table: SQLiteTable,
  idColumn: SQLiteColumn,
  userIdColumn: SQLiteColumn,
  ids: readonly string[],
): Promise<void> {
  for (const batch of chunk(ids, MAX_PARAMS_PER_LOOKUP)) {
    const taken = await db
      .select({ id: idColumn, userId: userIdColumn })
      .from(table)
      .where(inArray(idColumn, batch));

    if (taken.some((row) => row.userId !== userId)) {
      throw new ApiException('conflicting_write', 'Algún identificador de la copia ya está en uso');
    }
  }
}

/** Las series y las líneas de rutina solo pueden nombrar ejercicios que ya entraron en esta cuenta. */
async function assertExercisesImported(
  db: Database,
  userId: string,
  exerciseIds: readonly string[],
): Promise<void> {
  const unique = [...new Set(exerciseIds)];
  const found = new Set<string>();

  for (const ids of chunk(unique, MAX_PARAMS_PER_LOOKUP)) {
    const rows = await db
      .select({ id: trackedExercise.id })
      .from(trackedExercise)
      .where(and(eq(trackedExercise.userId, userId), inArray(trackedExercise.id, ids)));
    for (const row of rows) found.add(row.id);
  }

  const missing = unique.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new ApiException(
      'validation_failed',
      'La copia nombra ejercicios que todavía no se han importado',
      { missingExercises: missing.length },
    );
  }
}

interface CatalogSituation {
  /** Los ejercicios del lote que el catálogo de destino tiene sincronizados. */
  readonly available: ReadonlySet<string>;
  /** Las fichas de la cuenta que ya siguen alguno de esos ejercicios del catálogo. */
  readonly following: readonly { id: string; catalogId: string | null }[];
}

async function readCatalogSituation(
  db: Database,
  userId: string,
  catalogIds: readonly string[],
): Promise<CatalogSituation> {
  if (catalogIds.length === 0) return { available: new Set(), following: [] };

  // El lote trae como mucho cincuenta ejercicios, así que cada consulta cabe en los cien
  // parámetros de D1; van en un solo viaje.
  const [available, following] = await db.batch([
    db
      .select({ catalogId: catalogExercise.catalogId })
      .from(catalogExercise)
      .where(inArray(catalogExercise.catalogId, [...catalogIds])),
    db
      .select({ id: trackedExercise.id, catalogId: trackedExercise.catalogId })
      .from(trackedExercise)
      .where(
        and(
          eq(trackedExercise.userId, userId),
          inArray(trackedExercise.catalogId, [...catalogIds]),
        ),
      ),
  ]);

  return { available: new Set(available.map((row) => row.catalogId)), following };
}

/** Un peso o una marca del fichero a gramos; uno que no se puede guardar es un 400, no un 500. */
function toGrams(parse: (value: string) => number, value: string, rowId: string): number {
  try {
    return parse(value);
  } catch (error) {
    throw new ApiException('validation_failed', 'Un peso de la copia no se puede guardar', {
      id: rowId,
      value,
      reason: error instanceof Error ? error.message : 'desconocido',
    });
  }
}

async function runBatch(db: Database, statements: BatchItem<'sqlite'>[]): Promise<void> {
  const [first, ...rest] = statements;
  if (first === undefined) return;

  await db.batch([first, ...rest]);
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}
