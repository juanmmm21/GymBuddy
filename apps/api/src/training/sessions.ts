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
  type WorkoutSession,
  type WorkoutSessionDetail,
} from '@gymbuddy/shared';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { listSetsForSession } from '../db/queries';
import { setEntry, workoutSession, type SetEntryRow, type WorkoutSessionRow } from '../db/schema';
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
    source: request.source,
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
 * —la PWA y el bot a la vez— compartiendo posición.
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
  const session = await findSessionRow(db, userId, sessionId);
  if (session === null) throw sessionNotFound(sessionId);
  if (session.endedAt !== null) {
    throw new ApiException('session_closed', 'Esa sesión ya está cerrada', { sessionId });
  }

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
    source: request.source,
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

export function toWorkoutSession(row: WorkoutSessionRow): WorkoutSession {
  return {
    id: row.id,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    notes: row.notes,
    source: row.source,
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
    source: row.source,
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
