import type {
  CreateRoutineRequest,
  RepRange,
  Routine,
  RoutineItem,
  RoutineItemInput,
  UpdateRoutineRequest,
} from '@gymbuddy/shared';
import { and, asc, desc, eq, getTableColumns, isNull } from 'drizzle-orm';
import type { Database } from '../db/client';
import {
  routine,
  routineItem,
  type NewRoutineItemRow,
  type RoutineItemRow,
  type RoutineRow,
} from '../db/schema';
import { ApiException } from '../http/errors';
import { listTrackedExerciseFacts } from './exercises';

/**
 * `routine_item` tiene seis columnas y D1 admite cien parámetros por consulta, así que en
 * cada sentencia caben dieciséis filas. Con el tope de treinta líneas por rutina son dos
 * sentencias, que salen en el mismo `batch` que la rutina.
 */
const ITEMS_PER_STATEMENT = 16;

export interface ListRoutinesOptions {
  readonly includeArchived: boolean;
}

/**
 * Las rutinas del usuario con sus ejercicios ya ordenados. Va en un solo `left join` —y no
 * en dos consultas— porque una rutina sin líneas también tiene que salir: es el estado
 * normal de la que se acaba de crear en el editor.
 */
export async function listRoutines(
  db: Database,
  userId: string,
  options: ListRoutinesOptions,
): Promise<Routine[]> {
  const filter = options.includeArchived
    ? eq(routine.userId, userId)
    : and(eq(routine.userId, userId), isNull(routine.archivedAt));

  const rows = await db
    .select({ routine: getTableColumns(routine), item: getTableColumns(routineItem) })
    .from(routine)
    .leftJoin(routineItem, eq(routineItem.routineId, routine.id))
    .where(filter)
    .orderBy(asc(routine.createdAt), asc(routineItem.orderIndex));

  const routines: Routine[] = [];
  const byId = new Map<string, Routine>();

  for (const row of rows) {
    let current = byId.get(row.routine.id);
    if (current === undefined) {
      current = toRoutine(row.routine, []);
      byId.set(row.routine.id, current);
      routines.push(current);
    }

    if (row.item !== null) current.items.push(toRoutineItem(row.item));
  }

  return routines;
}

export async function findRoutine(
  db: Database,
  userId: string,
  routineId: string,
): Promise<Routine | null> {
  const row = await findRoutineRow(db, routineId);
  if (row === null || row.userId !== userId) return null;

  return toRoutine(row, await listRoutineItems(db, routineId));
}

/**
 * Crea la rutina con sus líneas. El identificador lo manda el cliente, igual que en el
 * resto de escrituras, así que reenviar el alta tiene que devolver la misma rutina en vez
 * de crear otra; que los identificadores de las líneas vengan también de fuera es lo que
 * permite reintentar sin duplicarlas.
 *
 * La existencia se comprueba **antes** de escribir y no con un `on conflict do nothing`
 * sobre la marcha, como en un ejercicio: aquí hay dos tablas, y descubrir el choque
 * después de haber insertado las líneas las dejaría colgando de una rutina ajena. La
 * escritura en sí va en un solo `batch`, que en D1 es una transacción: o entran la rutina
 * y todas sus líneas, o no entra ninguna.
 */
export async function createRoutine(
  db: Database,
  userId: string,
  request: CreateRoutineRequest,
  now: Date,
): Promise<{ routine: Routine; created: boolean }> {
  await assertExercisesBelongToUser(db, userId, request.items);

  const stored = await findRoutineRow(db, request.id);
  if (stored !== null) {
    // El identificador ya estaba. Si es de otro no se puede decir de quién: solo que no
    // sirve. Si es suyo y describe lo mismo, es un reenvío y se responde lo que hay.
    if (stored.userId !== userId) {
      throw new ApiException('conflicting_write', 'Ese identificador de rutina ya está en uso', {
        id: request.id,
      });
    }

    const existing = toRoutine(stored, await listRoutineItems(db, request.id));
    if (!describesSameRoutine(existing, request)) {
      throw new ApiException('conflicting_write', 'Esa rutina ya existe con otros datos', {
        id: request.id,
      });
    }

    return { routine: existing, created: false };
  }

  const row: RoutineRow = {
    id: request.id,
    userId,
    name: request.name,
    description: request.description ?? null,
    createdAt: now.toISOString(),
    archivedAt: null,
  };

  await db.batch([
    db.insert(routine).values(row).onConflictDoNothing({ target: routine.id }),
    ...insertItemStatements(db, request.id, request.items),
  ]);

  const created = await findRoutine(db, userId, request.id);
  if (created === null) {
    throw new ApiException('conflicting_write', 'Ese identificador de rutina ya está en uso', {
      id: request.id,
    });
  }

  return { routine: created, created: true };
}

/**
 * Cambia el nombre, la descripción, la lista de ejercicios y el archivado. La baja es
 * blanda: borrar la fila se llevaría por delante las líneas y, con ellas, la rutina que el
 * usuario quizá quiera recuperar la semana que viene.
 *
 * `items` se reemplaza entero, y el borrado y la inserción viajan en el mismo `batch` para
 * que la rutina no se quede vacía si algo falla a mitad. El orden lo da la posición en la
 * lista que llega, así que reordenar no es una escritura distinta de añadir o quitar.
 */
export async function updateRoutine(
  db: Database,
  userId: string,
  routineId: string,
  request: UpdateRoutineRequest,
  now: Date,
): Promise<Routine> {
  const stored = await findRoutineRow(db, routineId);
  if (stored === null || stored.userId !== userId) throw routineNotFound(routineId);

  if (request.items !== undefined) await assertExercisesBelongToUser(db, userId, request.items);

  const changes: Partial<RoutineRow> = {};
  if (request.name !== undefined) changes.name = request.name;
  if (request.description !== undefined) changes.description = request.description;
  if (request.archived !== undefined) {
    changes.archivedAt = request.archived ? now.toISOString() : null;
  }

  const statements = [];
  if (Object.keys(changes).length > 0) {
    statements.push(
      db
        .update(routine)
        .set(changes)
        .where(and(eq(routine.id, routineId), eq(routine.userId, userId))),
    );
  }
  if (request.items !== undefined) {
    statements.push(db.delete(routineItem).where(eq(routineItem.routineId, routineId)));
    statements.push(...insertItemStatements(db, routineId, request.items));
  }

  const [first, ...rest] = statements;
  if (first !== undefined) await db.batch([first, ...rest]);

  const updated = await findRoutine(db, userId, routineId);
  if (updated === null) throw routineNotFound(routineId);

  return updated;
}

/**
 * El rango de repeticiones objetivo de cada ejercicio según las rutinas del usuario: es lo
 * que afina el estancamiento. Un ejercicio puede estar en varias rutinas y dos veces en la
 * misma, así que hace falta una regla, y la decidió Juan el 2026-09-10: manda la rutina no
 * archivada creada más recientemente —la que refleja cómo entrena ahora— y, dentro de ella,
 * su primera línea. Sin ninguna rutina activa que lo nombre, el ejercicio no tiene rango.
 *
 * Se leen todas las líneas de las rutinas activas en una consulta: son pocas (treinta por
 * rutina como mucho) y el orden de la sentencia deja el reparto en quedarse con la primera.
 */
export async function listRoutineRepRanges(
  db: Database,
  userId: string,
  trackedExerciseId?: string,
): Promise<Map<string, RepRange>> {
  const rows = await db
    .select({
      trackedExerciseId: routineItem.trackedExerciseId,
      targetRepsMin: routineItem.targetRepsMin,
      targetRepsMax: routineItem.targetRepsMax,
    })
    .from(routineItem)
    .innerJoin(routine, eq(routine.id, routineItem.routineId))
    .where(
      and(
        eq(routine.userId, userId),
        isNull(routine.archivedAt),
        trackedExerciseId === undefined
          ? undefined
          : eq(routineItem.trackedExerciseId, trackedExerciseId),
      ),
    )
    // El id desempata dos rutinas creadas en el mismo instante: sin él, el rango de un
    // ejercicio podría cambiar entre dos consultas idénticas.
    .orderBy(desc(routine.createdAt), asc(routine.id), asc(routineItem.orderIndex));

  const ranges = new Map<string, RepRange>();
  for (const row of rows) {
    if (ranges.has(row.trackedExerciseId)) continue;
    ranges.set(row.trackedExerciseId, { min: row.targetRepsMin, max: row.targetRepsMax });
  }

  return ranges;
}

export function routineNotFound(routineId: string): ApiException {
  return new ApiException('not_found', `No existe la rutina "${routineId}"`);
}

/**
 * Las líneas apuntan a "mis ejercicios", así que se comprueba que son de quien escribe.
 * Un ejercicio ajeno o inexistente es un 404 y no un fallo de clave ajena: desde fuera,
 * lo que no es tuyo no existe. Los archivados se aceptan a propósito —una rutina puede
 * nombrar algo que se dejó de seguir y que se recupera de un toque desde su ficha.
 */
async function assertExercisesBelongToUser(
  db: Database,
  userId: string,
  items: readonly RoutineItemInput[],
): Promise<void> {
  const exerciseIds = [...new Set(items.map((item) => item.trackedExerciseId))];
  const facts = await listTrackedExerciseFacts(db, userId, exerciseIds);

  for (const exerciseId of exerciseIds) {
    if (!facts.has(exerciseId)) {
      throw new ApiException('not_found', `No existe el ejercicio "${exerciseId}"`);
    }
  }
}

/**
 * Las sentencias que suben las líneas, troceadas por el límite de parámetros de D1. El
 * `on conflict do nothing` es lo que hace repetible el alta: reenviarla con los mismos
 * identificadores no puede duplicar una línea.
 */
function insertItemStatements(db: Database, routineId: string, items: readonly RoutineItemInput[]) {
  const rows: NewRoutineItemRow[] = items.map((item, orderIndex) => ({
    id: item.id,
    routineId,
    trackedExerciseId: item.trackedExerciseId,
    orderIndex,
    targetSets: item.targetSets,
    targetRepsMin: item.targetRepsMin,
    targetRepsMax: item.targetRepsMax,
  }));

  const statements = [];
  for (let index = 0; index < rows.length; index += ITEMS_PER_STATEMENT) {
    statements.push(
      db
        .insert(routineItem)
        .values(rows.slice(index, index + ITEMS_PER_STATEMENT))
        .onConflictDoNothing({ target: routineItem.id }),
    );
  }

  return statements;
}

async function listRoutineItems(db: Database, routineId: string): Promise<RoutineItem[]> {
  const rows = await db
    .select()
    .from(routineItem)
    .where(eq(routineItem.routineId, routineId))
    .orderBy(asc(routineItem.orderIndex));

  return rows.map(toRoutineItem);
}

/**
 * La fila sin filtrar por usuario: quien llama decide si un identificador ajeno es un 404
 * (leer, editar) o un choque de identificadores (crear). Distinguirlo aquí obligaría a
 * consultar dos veces para saber cuál de los dos casos es.
 */
async function findRoutineRow(db: Database, routineId: string): Promise<RoutineRow | null> {
  const [row] = await db.select().from(routine).where(eq(routine.id, routineId)).limit(1);

  return row ?? null;
}

/**
 * Qué cuenta como "la misma rutina" al reenviar el alta. Entran las líneas y su orden:
 * una rutina es exactamente eso, y aceptar como reenvío una petición con otros ejercicios
 * dejaría al cliente creyendo que guardó algo que no está.
 */
function describesSameRoutine(stored: Routine, incoming: CreateRoutineRequest): boolean {
  if (stored.name !== incoming.name) return false;
  if (stored.description !== (incoming.description ?? null)) return false;
  if (stored.items.length !== incoming.items.length) return false;

  return stored.items.every((item, index) => {
    const other = incoming.items[index];

    return (
      other !== undefined &&
      item.id === other.id &&
      item.trackedExerciseId === other.trackedExerciseId &&
      item.targetSets === other.targetSets &&
      item.targetRepsMin === other.targetRepsMin &&
      item.targetRepsMax === other.targetRepsMax
    );
  });
}

function toRoutine(row: RoutineRow, items: RoutineItem[]): Routine {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt,
    archivedAt: row.archivedAt,
    items,
  };
}

function toRoutineItem(row: RoutineItemRow): RoutineItem {
  return {
    id: row.id,
    trackedExerciseId: row.trackedExerciseId,
    orderIndex: row.orderIndex,
    targetSets: row.targetSets,
    targetRepsMin: row.targetRepsMin,
    targetRepsMax: row.targetRepsMax,
  };
}
