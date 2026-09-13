import {
  formatGramsAsKilograms,
  formatGramsAsVolumeKilograms,
  muscleSchema,
  tenthsToRpe,
  type ExportSessionPage,
  type ExportSnapshot,
  type ExportedExercise,
  type ExportedRecord,
  type ExportedRoutine,
  type ExportedSet,
  type Muscle,
} from '@gymbuddy/shared';
import { and, asc, count, eq, getTableColumns, inArray } from 'drizzle-orm';
import type { Database } from '../db/client';
import {
  catalogExercise,
  personalRecord,
  setEntry,
  trackedExercise,
  workoutSession,
  type PersonalRecordRow,
  type SetEntryRow,
  type UserRow,
} from '../db/schema';
import { parseNullableBodyPart } from './exercises';
import { listRoutines } from './routines';

export interface ExportSessionPageQuery {
  readonly limit: number;
  readonly offset: number;
}

/**
 * Todo lo del usuario salvo las sesiones: perfil, ejercicios y rutinas. Cabe en una respuesta
 * porque crece con lo que el usuario sigue, no con los años que lleva entrenando.
 *
 * Las rutinas se leen **antes** que los ejercicios a propósito: los ejercicios no se borran
 * nunca, así que leídos después están todos los que nombran las líneas, aunque se haya creado
 * uno entre las dos consultas. Al revés, el fichero podría traer una línea huérfana.
 */
export async function getExportSnapshot(
  db: Database,
  user: UserRow,
  now: Date,
): Promise<ExportSnapshot> {
  const routines = await listRoutines(db, user.id, { includeArchived: true });

  const exercises = await db
    .select({
      exercise: getTableColumns(trackedExercise),
      catalog: {
        nameEs: catalogExercise.nameEs,
        nameEn: catalogExercise.nameEn,
        muscle: catalogExercise.muscle,
        bodyPart: catalogExercise.bodyPart,
      },
    })
    .from(trackedExercise)
    .leftJoin(catalogExercise, eq(trackedExercise.catalogId, catalogExercise.catalogId))
    .where(eq(trackedExercise.userId, user.id))
    .orderBy(asc(trackedExercise.createdAt), asc(trackedExercise.id));

  return {
    exportedAt: now.toISOString(),
    profile: {
      displayName: user.displayName,
      locale: user.locale,
      unitSystem: user.unitSystem,
    },
    exercises: exercises.map(({ exercise, catalog }): ExportedExercise => {
      const fromCatalog = exercise.catalogId !== null && catalog !== null;
      const catalogName =
        catalog === null ? null : user.locale === 'es' ? catalog.nameEs : catalog.nameEn;

      return {
        id: exercise.id,
        origin: exercise.catalogId === null ? 'custom' : 'catalog',
        catalogId: exercise.catalogId,
        // El `catalogId` es el último recurso: la clave ajena impide que falte la fila del
        // catálogo, pero un fichero sin nombre legible no le serviría a nadie.
        name: catalogName ?? exercise.customName ?? exercise.catalogId ?? exercise.id,
        muscle: parseNullableMuscle(fromCatalog ? catalog.muscle : exercise.customMuscle),
        bodyPart: parseNullableBodyPart(fromCatalog ? catalog.bodyPart : exercise.customBodyPart),
        notes: exercise.notes,
        createdAt: exercise.createdAt,
        archivedAt: exercise.archivedAt,
      };
    }),
    routines: routines.map((routine): ExportedRoutine => ({
      id: routine.id,
      name: routine.name,
      description: routine.description,
      createdAt: routine.createdAt,
      archivedAt: routine.archivedAt,
      items: routine.items.map((item) => ({
        id: item.id,
        trackedExerciseId: item.trackedExerciseId,
        orderIndex: item.orderIndex,
        targetSets: item.targetSets,
        targetRepsMin: item.targetRepsMin,
        targetRepsMax: item.targetRepsMax,
      })),
    })),
  };
}

/**
 * Una página de sesiones con sus series y las marcas que puso cada serie, de la más antigua a
 * la más reciente. Un historial de años no cabe en los 10 ms de CPU de una invocación, así que
 * la PWA lo pide por páginas y monta el fichero ella.
 *
 * El orden ascendente es lo que hace seguro pedir por desplazamiento: una sesión que se abre
 * mientras tanto va al final y no empuja a ninguna de las ya servidas a la página siguiente.
 */
export async function listExportSessionPage(
  db: Database,
  userId: string,
  query: ExportSessionPageQuery,
): Promise<ExportSessionPage> {
  const filter = eq(workoutSession.userId, userId);

  const [totals, sessions] = await db.batch([
    db.select({ total: count() }).from(workoutSession).where(filter),
    db
      .select()
      .from(workoutSession)
      .where(filter)
      .orderBy(asc(workoutSession.startedAt), asc(workoutSession.id))
      .limit(query.limit)
      .offset(query.offset),
  ]);

  const page = {
    total: totals[0]?.total ?? 0,
    limit: query.limit,
    offset: query.offset,
  };
  if (sessions.length === 0) return { items: [], ...page };

  // Las series y sus marcas van en el mismo `batch`, que en D1 es una transacción: una marca
  // no puede llegar sin la serie que la puso. Los identificadores de la página ya son de este
  // usuario, y el tope de la página los deja lejos de los cien parámetros de D1.
  const sessionIds = sessions.map((session) => session.id);
  const [sets, records] = await db.batch([
    db
      .select()
      .from(setEntry)
      .where(inArray(setEntry.sessionId, sessionIds))
      .orderBy(asc(setEntry.sessionId), asc(setEntry.orderIndex)),
    db
      .select(getTableColumns(personalRecord))
      .from(personalRecord)
      .innerJoin(setEntry, eq(personalRecord.setEntryId, setEntry.id))
      .where(and(eq(personalRecord.userId, userId), inArray(setEntry.sessionId, sessionIds)))
      .orderBy(asc(personalRecord.achievedAt), asc(personalRecord.id)),
  ]);

  const recordsBySet = groupBy(records, (record) => record.setEntryId);
  const setsBySession = groupBy(sets, (set) => set.sessionId);

  return {
    items: sessions.map((session) => ({
      id: session.id,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      notes: session.notes,
      sets: (setsBySession.get(session.id) ?? []).map((set) =>
        toExportedSet(set, recordsBySet.get(set.id) ?? []),
      ),
    })),
    ...page,
  };
}

function toExportedSet(row: SetEntryRow, records: readonly PersonalRecordRow[]): ExportedSet {
  return {
    id: row.id,
    trackedExerciseId: row.trackedExerciseId,
    orderIndex: row.orderIndex,
    weight: formatGramsAsKilograms(row.weightGrams),
    reps: row.reps,
    rpe: row.rpeTenths === null ? null : tenthsToRpe(row.rpeTenths),
    isWarmup: row.isWarmup,
    completedAt: row.completedAt,
    records: records.map((record): ExportedRecord => ({
      id: record.id,
      kind: record.kind,
      value: formatGramsAsVolumeKilograms(record.valueGrams),
      achievedAt: record.achievedAt,
    })),
  };
}

function groupBy<T>(rows: readonly T[], keyOf: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [row]);
    } else {
      group.push(row);
    }
  }

  return groups;
}

function parseNullableMuscle(value: string | null): Muscle | null {
  return value === null ? null : muscleSchema.parse(value);
}
