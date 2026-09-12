import {
  formatGramsAsKilograms,
  parseKilogramsToGrams,
  rpeToTenths,
  tenthsToRpe,
  type EndSessionRequest,
  type LogSetRequest,
  type PersonalRecord,
  type SetEntry,
  type StartSessionRequest,
  type UpdateSetRequest,
  type WorkoutSession,
  type WorkoutSessionDetail,
} from '@gymbuddy/shared';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { listSetsForSession } from '../db/queries';
import {
  personalRecord,
  setEntry,
  workoutSession,
  type SetEntryRow,
  type WorkoutSessionRow,
} from '../db/schema';
import { ApiException } from '../http/errors';
import { assertTrackedExerciseBelongsToUser } from './exercises';
import { applyPersonalRecords } from './records';

/**
 * Abre la sesión. El identificador lo trae el cliente, así que reenviar la apertura
 * devuelve la misma sesión: es lo que hace la cola offline cuando la red vuelve a mitad
 * del entrenamiento. Solo puede haber una sesión sin cerrar, porque solo se entrena una vez.
 */
export async function startWorkoutSession(
  db: Database,
  userId: string,
  request: StartSessionRequest,
  now: Date,
): Promise<{ session: WorkoutSessionDetail; created: boolean }> {
  const active = await findActiveSessionRow(db, userId);
  if (active !== null && active.id !== request.id) {
    throw new ApiException('session_already_open', 'Ya tienes una sesión sin cerrar', {
      sessionId: active.id,
    });
  }

  const row: WorkoutSessionRow = {
    id: request.id,
    userId,
    startedAt: request.startedAt ?? now.toISOString(),
    endedAt: null,
    notes: request.notes ?? null,
  };

  const inserted = await db
    .insert(workoutSession)
    .values(row)
    .onConflictDoNothing({ target: workoutSession.id })
    .returning();

  if (inserted.length > 0) {
    return { session: { ...toWorkoutSession(row), sets: [] }, created: true };
  }

  // El identificador ya existía. Si es de este usuario es un reenvío y se responde lo que
  // hay —incluso ya cerrada—; si no, el UUID está pillado y no se puede decir por quién.
  const existing = await requireSessionDetail(db, userId, request.id);

  return { session: existing, created: false };
}

/** La sesión en curso con sus series, o `null` si hoy todavía no se ha empezado nada. */
export async function findActiveSession(
  db: Database,
  userId: string,
): Promise<WorkoutSessionDetail | null> {
  const active = await findActiveSessionRow(db, userId);
  if (active === null) return null;

  const sets = await listSetsForSession(db, userId, active.id);

  return { ...toWorkoutSession(active), sets: sets.map(toSetEntry) };
}

export async function findSessionDetail(
  db: Database,
  userId: string,
  sessionId: string,
): Promise<WorkoutSessionDetail | null> {
  const row = await findSessionRow(db, userId, sessionId);
  if (row === null) return null;

  const sets = await listSetsForSession(db, userId, sessionId);

  return { ...toWorkoutSession(row), sets: sets.map(toSetEntry) };
}

/**
 * Registra una serie en una sesión abierta. El `orderIndex` lo calcula la propia sentencia
 * de inserción: pedirlo antes en una consulta aparte dejaría a dos series simultáneas
 * —dos móviles, o la cola offline reenviando mientras se registra otra— compartiendo posición.
 *
 * Los récords se evalúan al final, sobre la fila que quedó guardada. También en el
 * reenvío: si el primer intento insertó la serie y se cayó antes de escribir la marca,
 * repetir la petición la arregla, y si ya estaba escrita no se duplica.
 */
export async function logSet(
  db: Database,
  userId: string,
  sessionId: string,
  request: LogSetRequest,
  now: Date,
): Promise<{ set: SetEntry; records: PersonalRecord[]; created: boolean }> {
  await requireOpenSession(db, userId, sessionId);

  await assertTrackedExerciseBelongsToUser(db, userId, request.trackedExerciseId);

  const incoming = {
    id: request.id,
    sessionId,
    trackedExerciseId: request.trackedExerciseId,
    weightGrams: parseWeight(request.weight),
    reps: request.reps,
    rpeTenths: request.rpe === null || request.rpe === undefined ? null : rpeToTenths(request.rpe),
    isWarmup: request.isWarmup ?? false,
    completedAt: request.completedAt ?? now.toISOString(),
  };

  const inserted = await db
    .insert(setEntry)
    .values({
      ...incoming,
      orderIndex: sql<number>`(select coalesce(max(${setEntry.orderIndex}), -1) + 1 from ${setEntry} where ${setEntry.sessionId} = ${sessionId})`,
    })
    .onConflictDoNothing({ target: setEntry.id })
    .returning();

  const [insertedRow] = inserted;
  if (insertedRow !== undefined) {
    return {
      set: toSetEntry(insertedRow),
      records: await applyPersonalRecords(db, userId, insertedRow),
      created: true,
    };
  }

  const existing = await findSetRow(db, userId, request.id);
  if (existing === null) {
    throw new ApiException('conflicting_write', 'Ese identificador de serie ya está en uso', {
      id: request.id,
    });
  }

  if (!describesSameSet(existing, incoming)) {
    throw new ApiException('conflicting_write', 'Esa serie ya existe con otros datos', {
      id: request.id,
    });
  }

  return {
    set: toSetEntry(existing),
    records: await applyPersonalRecords(db, userId, existing),
    created: false,
  };
}

/**
 * Corrige una serie ya registrada, y solo mientras la sesión sigue abierta: reescribir el
 * entrenamiento de hace meses es otra cosa y no es lo que pasa tecleando entre series.
 *
 * Las marcas que puso la serie se borran antes de reevaluarla, porque describían lo que
 * decía **antes** de corregirse: dejarlas convertiría un peso mal tecleado en un récord
 * permanente. Con ellas fuera, `applyPersonalRecords` compara contra el resto del
 * historial —la tabla si sigue completa, y si no un repaso de las series— y vuelve a
 * escribir solo lo que la serie corregida siga mereciendo.
 */
export async function updateSet(
  db: Database,
  userId: string,
  sessionId: string,
  setId: string,
  request: UpdateSetRequest,
): Promise<{ set: SetEntry; records: PersonalRecord[] }> {
  await requireOpenSession(db, userId, sessionId);

  const stored = await findSetInSession(db, sessionId, setId);
  if (stored === null) throw setNotFound(setId);

  const changes: Partial<SetEntryRow> = {};
  if (request.weight !== undefined) changes.weightGrams = parseWeight(request.weight);
  if (request.reps !== undefined) changes.reps = request.reps;
  if (request.rpe !== undefined) {
    changes.rpeTenths = request.rpe === null ? null : rpeToTenths(request.rpe);
  }
  if (request.isWarmup !== undefined) changes.isWarmup = request.isWarmup;

  // Sin campos no se toca nada: una corrección vacía no puede mover las marcas.
  if (Object.keys(changes).length === 0) return { set: toSetEntry(stored), records: [] };

  const [updated] = await db
    .update(setEntry)
    .set(changes)
    .where(and(eq(setEntry.id, setId), eq(setEntry.sessionId, sessionId)))
    .returning();

  if (updated === undefined) throw setNotFound(setId);

  await db
    .delete(personalRecord)
    .where(and(eq(personalRecord.userId, userId), eq(personalRecord.setEntryId, setId)));

  return { set: toSetEntry(updated), records: await applyPersonalRecords(db, userId, updated) };
}

/**
 * Borra una serie de una sesión abierta. Las marcas que puso se van con ella por la clave
 * ajena (`on delete cascade`), así que no hay que limpiarlas a mano.
 *
 * Es idempotente a propósito: borrar una serie que ya no está responde igual que borrarla,
 * porque es lo que hará la cola offline al reintentar un borrado que sí llegó. El hueco
 * que deja en el `order_index` no se rellena: solo sirve para ordenar, y renumerar el
 * resto convertiría un borrado en una reescritura de toda la sesión.
 */
export async function removeSet(
  db: Database,
  userId: string,
  sessionId: string,
  setId: string,
): Promise<void> {
  await requireOpenSession(db, userId, sessionId);

  await db.delete(setEntry).where(and(eq(setEntry.id, setId), eq(setEntry.sessionId, sessionId)));
}

/** Cierra la sesión. Cerrar una que ya lo estaba devuelve la misma: la cola offline reenvía. */
export async function endWorkoutSession(
  db: Database,
  userId: string,
  sessionId: string,
  request: EndSessionRequest,
  now: Date,
): Promise<WorkoutSessionDetail> {
  const session = await findSessionRow(db, userId, sessionId);
  if (session === null) throw sessionNotFound(sessionId);

  if (session.endedAt === null) {
    const endedAt = request.endedAt ?? now.toISOString();
    if (Date.parse(endedAt) < Date.parse(session.startedAt)) {
      throw new ApiException('validation_failed', 'La sesión no puede terminar antes de empezar', {
        startedAt: session.startedAt,
        endedAt,
      });
    }

    await db
      .update(workoutSession)
      .set({ endedAt, notes: request.notes ?? session.notes })
      .where(and(eq(workoutSession.id, sessionId), eq(workoutSession.userId, userId)));
  }

  return requireSessionDetail(db, userId, sessionId);
}

export function sessionNotFound(sessionId: string): ApiException {
  return new ApiException('not_found', `No existe la sesión "${sessionId}"`);
}

function setNotFound(setId: string): ApiException {
  return new ApiException('not_found', `No existe la serie "${setId}" en esa sesión`);
}

export function toWorkoutSession(row: WorkoutSessionRow): WorkoutSession {
  return {
    id: row.id,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    notes: row.notes,
  };
}

export function toSetEntry(row: SetEntryRow): SetEntry {
  return {
    id: row.id,
    trackedExerciseId: row.trackedExerciseId,
    orderIndex: row.orderIndex,
    weight: formatGramsAsKilograms(row.weightGrams),
    reps: row.reps,
    rpe: row.rpeTenths === null ? null : tenthsToRpe(row.rpeTenths),
    isWarmup: row.isWarmup,
    completedAt: row.completedAt,
  };
}

async function requireSessionDetail(
  db: Database,
  userId: string,
  sessionId: string,
): Promise<WorkoutSessionDetail> {
  const detail = await findSessionDetail(db, userId, sessionId);
  if (detail === null) throw sessionNotFound(sessionId);

  return detail;
}

async function findSessionRow(
  db: Database,
  userId: string,
  sessionId: string,
): Promise<WorkoutSessionRow | null> {
  const [row] = await db
    .select()
    .from(workoutSession)
    .where(and(eq(workoutSession.id, sessionId), eq(workoutSession.userId, userId)))
    .limit(1);

  return row ?? null;
}

async function findActiveSessionRow(
  db: Database,
  userId: string,
): Promise<WorkoutSessionRow | null> {
  const [row] = await db
    .select()
    .from(workoutSession)
    .where(and(eq(workoutSession.userId, userId), isNull(workoutSession.endedAt)))
    .orderBy(desc(workoutSession.startedAt))
    .limit(1);

  return row ?? null;
}

/**
 * La sesión sobre la que se puede escribir: existe, es de este usuario y sigue abierta.
 * Cerrada no se toca, ni para registrar ni para corregir; es lo que ve la cola offline
 * cuando reenvía sobre una sesión que se cerró desde otro móvil mientras no había red.
 */
async function requireOpenSession(
  db: Database,
  userId: string,
  sessionId: string,
): Promise<WorkoutSessionRow> {
  const session = await findSessionRow(db, userId, sessionId);
  if (session === null) throw sessionNotFound(sessionId);
  if (session.endedAt !== null) {
    throw new ApiException('session_closed', 'Esa sesión ya está cerrada', { sessionId });
  }

  return session;
}

/** Una serie dentro de una sesión ya comprobada: el usuario lo puso el paso anterior. */
async function findSetInSession(
  db: Database,
  sessionId: string,
  setId: string,
): Promise<SetEntryRow | null> {
  const [row] = await db
    .select()
    .from(setEntry)
    .where(and(eq(setEntry.id, setId), eq(setEntry.sessionId, sessionId)))
    .limit(1);

  return row ?? null;
}

/** La serie por identificador, atada al usuario a través de la sesión que la contiene. */
async function findSetRow(
  db: Database,
  userId: string,
  setId: string,
): Promise<SetEntryRow | null> {
  const [row] = await db
    .select({ set: setEntry })
    .from(setEntry)
    .innerJoin(workoutSession, eq(setEntry.sessionId, workoutSession.id))
    .where(and(eq(setEntry.id, setId), eq(workoutSession.userId, userId)))
    .limit(1);

  return row?.set ?? null;
}

/**
 * Qué cuenta como "la misma serie" al reenviarla. El momento y la superficie quedan fuera
 * a propósito: una serie que se apuntó sin red y se reenvía desde otra pantalla sigue
 * siendo la misma, y tratarla como choque bloquearía la cola de la fase 13.
 */
function describesSameSet(stored: SetEntryRow, incoming: Omit<SetEntryRow, 'orderIndex'>): boolean {
  return (
    stored.sessionId === incoming.sessionId &&
    stored.trackedExerciseId === incoming.trackedExerciseId &&
    stored.weightGrams === incoming.weightGrams &&
    stored.reps === incoming.reps &&
    stored.rpeTenths === incoming.rpeTenths &&
    stored.isWarmup === incoming.isWarmup
  );
}

/** El peso llega como "82.50" y se guarda en gramos enteros; un formato imposible es un 400. */
function parseWeight(weight: string): number {
  try {
    return parseKilogramsToGrams(weight);
  } catch (error) {
    throw new ApiException('validation_failed', 'El peso está fuera de lo que se puede registrar', {
      weight,
      reason: error instanceof Error ? error.message : 'desconocido',
    });
  }
}
