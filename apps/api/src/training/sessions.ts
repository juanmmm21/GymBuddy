import {
  cardioSetStartedAt,
  continuesIdleSession,
  endsCardioInProgress,
  formatGramsAsKilograms,
  idleSessionEndAt,
  parseKilogramsToGrams,
  rpeToTenths,
  tenthsToRpe,
  type EndSessionRequest,
  type LogSetRequest,
  type PersonalRecord,
  type SetEntry,
  type StartCardioRequest,
  type StartSessionRequest,
  type UpdateSetRequest,
  type WorkoutSession,
  type WorkoutSessionDetail,
} from '@gymbuddy/shared';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { runBatch } from '../db/batching';
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
import { applyPersonalRecords, personalRecordRewriteStatements } from './records';
import { setMeasureColumns, setMeasureOf, type SetMeasure } from './set-measure';

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
    endedAutomatically: false,
    notes: request.notes ?? null,
    cardioStartedAt: null,
  };

  const inserted = await db
    .insert(workoutSession)
    .values(row)
    .onConflictDoNothing({ target: workoutSession.id })
    .returning();

  if (inserted.length > 0) {
    return { session: toWorkoutSessionDetail(row, []), created: true };
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

  return toWorkoutSessionDetail(active, sets);
}

export async function findSessionDetail(
  db: Database,
  userId: string,
  sessionId: string,
): Promise<WorkoutSessionDetail | null> {
  const row = await findSessionRow(db, userId, sessionId);
  if (row === null) return null;

  const sets = await listSetsForSession(db, userId, sessionId);

  return toWorkoutSessionDetail(row, sets);
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
  const completedAt = request.completedAt ?? now.toISOString();
  // Un cardio se apunta al acabarlo: lo que continúa la sesión es la hora a la que empezó.
  const { session, reopened } = await requireWritableSession(db, userId, sessionId, {
    kind: 'log',
    at:
      request.kind === 'cardio'
        ? cardioSetStartedAt(completedAt, request.durationSeconds)
        : completedAt,
  });

  await assertTrackedExerciseBelongsToUser(db, userId, request.trackedExerciseId);

  const measure: SetMeasure =
    request.kind === 'cardio'
      ? {
          kind: 'cardio',
          durationSeconds: request.durationSeconds,
          distanceMeters: request.distanceMeters ?? null,
        }
      : { kind: 'strength', weightGrams: parseWeight(request.weight), reps: request.reps };

  const incoming = {
    id: request.id,
    sessionId,
    trackedExerciseId: request.trackedExerciseId,
    ...setMeasureColumns(measure),
    rpeTenths: request.rpe === null || request.rpe === undefined ? null : rpeToTenths(request.rpe),
    isWarmup: request.isWarmup ?? false,
    completedAt,
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

  // Apuntar el cardio es terminarlo. Solo al insertarlo: el reenvío de uno viejo no puede apagar
  // el que se empezó después.
  if (
    insertedRow !== undefined &&
    insertedRow.kind === 'cardio' &&
    session.cardioStartedAt !== null &&
    endsCardioInProgress(session.cardioStartedAt, insertedRow.completedAt)
  ) {
    await clearCardioInProgress(db, userId, sessionId, session.cardioStartedAt);
  }

  // Una serie de la cola que reabrió la sesión puede ser ya vieja: si con ella la sesión sigue
  // inactiva, se vuelve a cerrar, ahora a la hora de esta serie.
  if (reopened) await closeIdleSession(db, userId, now);

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
 * entrenamiento de hace meses es otra cosa y no es lo que pasa tecleando entre series. Solo se
 * corrige lo que la serie mide: pedirle kilos a una de cardio es un 400, no un cambio de tipo.
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
  await requireWritableSession(db, userId, sessionId, { kind: 'correct' });

  const stored = await findSetInSession(db, sessionId, setId);
  if (stored === null) throw setNotFound(setId);

  assertCorrectionFitsKind(stored, request);

  const changes: Partial<SetEntryRow> = {};
  if (request.weight !== undefined) changes.weightGrams = parseWeight(request.weight);
  if (request.reps !== undefined) changes.reps = request.reps;
  if (request.durationSeconds !== undefined) changes.durationSeconds = request.durationSeconds;
  if (request.distanceMeters !== undefined) changes.distanceMeters = request.distanceMeters;
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
 * ajena (`on delete cascade`), y en el mismo lote se reescriben las que vinieron detrás: si
 * era la del récord, la siguiente mejor serie pasa a tenerlo.
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
  await requireWritableSession(db, userId, sessionId, { kind: 'correct' });

  const stored = await findSetInSession(db, sessionId, setId);
  if (stored === null) return;

  await runBatch(db, [
    db.delete(setEntry).where(and(eq(setEntry.id, setId), eq(setEntry.sessionId, sessionId))),
    ...(await personalRecordRewriteStatements(db, userId, [stored])),
  ]);
}

/**
 * Borra un entrenamiento entero, abierto o cerrado: sus series y sus marcas se van por la clave
 * ajena, y en el mismo lote se reescriben las marcas que vinieron después en los ejercicios que
 * tocaba. Lo que la sesión recordaba en el dispositivo (rutina, ajustes) no vive en el Worker.
 *
 * Idempotente como borrar una serie: una sesión que ya no está —o que nunca fue de este usuario—
 * responde igual, porque la cola offline o un segundo toque repiten el borrado y un 404 ahí no
 * contaría nada útil; y a quien no es su dueño no le confirma que exista.
 */
export async function deleteWorkoutSession(
  db: Database,
  userId: string,
  sessionId: string,
): Promise<void> {
  const session = await findSessionRow(db, userId, sessionId);
  if (session === null) return;

  const sets = await listSetsForSession(db, userId, sessionId);

  await runBatch(db, [
    db
      .delete(workoutSession)
      .where(and(eq(workoutSession.id, sessionId), eq(workoutSession.userId, userId))),
    ...(await personalRecordRewriteStatements(db, userId, sets)),
  ]);
}

/**
 * Empieza el cardio que se apuntará al terminarlo: mientras dura, la sesión no se cierra sola
 * (revisión del ADR 0008). Repetirlo solo mueve la hora, así que la cola lo reenvía sin miedo.
 *
 * Llega por la cola como una serie, así que reabre igual una sesión que se cerró sola si empezar
 * el cardio continúa su actividad: son las series de antes, apuntadas sin cobertura, y el cardio
 * que vino detrás.
 */
export async function startCardio(
  db: Database,
  userId: string,
  sessionId: string,
  request: StartCardioRequest,
  now: Date,
): Promise<WorkoutSessionDetail> {
  const startedAt = request.startedAt ?? now.toISOString();
  const { session, reopened } = await requireWritableSession(db, userId, sessionId, {
    kind: 'log',
    at: startedAt,
  });
  if (Date.parse(startedAt) < Date.parse(session.startedAt)) {
    throw new ApiException('validation_failed', 'El cardio no puede empezar antes que la sesión', {
      startedAt: session.startedAt,
      cardioStartedAt: startedAt,
    });
  }

  await db
    .update(workoutSession)
    .set({ cardioStartedAt: startedAt })
    .where(and(eq(workoutSession.id, sessionId), eq(workoutSession.userId, userId)));

  // Igual que una serie vieja de la cola: si con este cardio la sesión ya no sigue viva, se vuelve a cerrar.
  if (reopened) await closeIdleSession(db, userId, now);

  return requireSessionDetail(db, userId, sessionId);
}

/**
 * Deja de contar el cardio en marcha sin apuntarlo: se empezó sin querer o no se llegó a hacer.
 * Idempotente como borrar una serie, porque también pasa por la cola.
 */
export async function cancelCardio(db: Database, userId: string, sessionId: string): Promise<void> {
  await requireWritableSession(db, userId, sessionId, { kind: 'correct' });

  await db
    .update(workoutSession)
    .set({ cardioStartedAt: null })
    .where(and(eq(workoutSession.id, sessionId), eq(workoutSession.userId, userId)));
}

/**
 * Cierra la sesión. Cerrar una que ya lo estaba devuelve la misma: la cola offline reenvía.
 *
 * Si se cerró sola y el «Terminar» que llega de la cola cae dentro del margen de inactividad,
 * manda la hora de quien entrenaba: pulsó a tiempo y la sesión no estaba abandonada.
 */
export async function endWorkoutSession(
  db: Database,
  userId: string,
  sessionId: string,
  request: EndSessionRequest,
  now: Date,
): Promise<WorkoutSessionDetail> {
  const session = await findSessionRow(db, userId, sessionId);
  if (session === null) throw sessionNotFound(sessionId);

  if (
    session.endedAt !== null &&
    session.endedAutomatically &&
    request.endedAt !== undefined &&
    Date.parse(request.endedAt) > Date.parse(session.endedAt) &&
    continuesIdleSession(session.endedAt, request.endedAt)
  ) {
    await db
      .update(workoutSession)
      .set({
        endedAt: request.endedAt,
        endedAutomatically: false,
        notes: request.notes ?? session.notes,
        cardioStartedAt: null,
      })
      .where(and(eq(workoutSession.id, sessionId), eq(workoutSession.userId, userId)));
  }

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
      .set({ endedAt, notes: request.notes ?? session.notes, cardioStartedAt: null })
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

function toWorkoutSessionDetail(
  row: WorkoutSessionRow,
  sets: readonly SetEntryRow[],
): WorkoutSessionDetail {
  return {
    ...toWorkoutSession(row),
    sets: sets.map(toSetEntry),
    cardioStartedAt: row.cardioStartedAt,
  };
}

export function toSetEntry(row: SetEntryRow): SetEntry {
  const base = {
    id: row.id,
    trackedExerciseId: row.trackedExerciseId,
    orderIndex: row.orderIndex,
    rpe: row.rpeTenths === null ? null : tenthsToRpe(row.rpeTenths),
    isWarmup: row.isWarmup,
    completedAt: row.completedAt,
  };
  const measure = setMeasureOf(row);

  return measure.kind === 'strength'
    ? {
        ...base,
        kind: 'strength',
        weight: formatGramsAsKilograms(measure.weightGrams),
        reps: measure.reps,
      }
    : {
        ...base,
        kind: 'cardio',
        durationSeconds: measure.durationSeconds,
        distanceMeters: measure.distanceMeters,
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
 * Cierra la sesión abierta de ese usuario si lleva `SESSION_IDLE_LIMIT_MINUTES` sin actividad
 * (ADR 0008), a la hora de su última actividad. Se llama antes de leer o escribir nada de
 * entrenamiento, así que ninguna respuesta enseña abierta una sesión abandonada y abrir la
 * siguiente no choca con ella. No hay barrido por Cron: los datos de un usuario solo los lee él.
 *
 * Las horas de las series se comparan en JavaScript y no en SQL porque el contrato admite
 * desfase horario y como texto no ordenarían bien. Una sesión abierta tiene unas decenas de series.
 */
export async function closeIdleSession(db: Database, userId: string, now: Date): Promise<void> {
  const open = await findActiveSessionRow(db, userId);
  if (open === null) return;

  const sets = await db
    .select({ completedAt: setEntry.completedAt })
    .from(setEntry)
    .where(eq(setEntry.sessionId, open.id));

  const endedAt = idleSessionEndAt(
    {
      startedAt: open.startedAt,
      setCompletedAts: sets.map((set) => set.completedAt),
      cardioStartedAt: open.cardioStartedAt,
    },
    now,
  );
  if (endedAt === null) return;

  // El cardio que pasó su tope se olvida al cerrar: si la sesión se reabre, no puede volver a contar.
  await db
    .update(workoutSession)
    .set({ endedAt, endedAutomatically: true, cardioStartedAt: null })
    .where(
      and(
        eq(workoutSession.id, open.id),
        eq(workoutSession.userId, userId),
        isNull(workoutSession.endedAt),
      ),
    );
}

/** Qué se quiere escribir: una serie nueva, con su hora, o corregir lo que ya hay. */
type SessionWriteIntent =
  { readonly kind: 'log'; readonly at: string } | { readonly kind: 'correct' };

/**
 * La sesión sobre la que se puede escribir: existe, es de este usuario y sigue abierta. Una que
 * cerró quien entrenaba no se toca; es lo que ve la cola offline cuando reenvía sobre una sesión
 * que se cerró desde otro móvil mientras no había red.
 *
 * Una que **se cerró sola** es otra cosa: el Worker la dio por abandonada sin noticias, y las
 * noticias pueden estar esperando en la cola de un móvil sin cobertura. Las correcciones entran
 * sin más, y una serie nueva la reabre si su hora continúa la actividad y no hay otra sesión
 * abierta; si no, ya era otro entrenamiento.
 */
async function requireWritableSession(
  db: Database,
  userId: string,
  sessionId: string,
  intent: SessionWriteIntent,
): Promise<{ session: WorkoutSessionRow; reopened: boolean }> {
  const session = await findSessionRow(db, userId, sessionId);
  if (session === null) throw sessionNotFound(sessionId);
  if (session.endedAt === null) return { session, reopened: false };

  const closed = new ApiException('session_closed', 'Esa sesión ya está cerrada', { sessionId });
  if (!session.endedAutomatically) throw closed;
  if (intent.kind === 'correct') return { session, reopened: false };
  if (!continuesIdleSession(session.endedAt, intent.at)) throw closed;

  const active = await findActiveSessionRow(db, userId);
  if (active !== null && active.id !== sessionId) throw closed;

  await db
    .update(workoutSession)
    .set({ endedAt: null, endedAutomatically: false })
    .where(
      and(
        eq(workoutSession.id, sessionId),
        eq(workoutSession.userId, userId),
        eq(workoutSession.endedAutomatically, true),
      ),
    );

  return { session: { ...session, endedAt: null, endedAutomatically: false }, reopened: true };
}

/**
 * Apaga el cardio en marcha, pero solo si sigue siendo el mismo: otro móvil puede haber empezado
 * uno nuevo entre la lectura y esta escritura.
 */
async function clearCardioInProgress(
  db: Database,
  userId: string,
  sessionId: string,
  cardioStartedAt: string,
): Promise<void> {
  await db
    .update(workoutSession)
    .set({ cardioStartedAt: null })
    .where(
      and(
        eq(workoutSession.id, sessionId),
        eq(workoutSession.userId, userId),
        eq(workoutSession.cardioStartedAt, cardioStartedAt),
      ),
    );
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
    stored.kind === incoming.kind &&
    stored.weightGrams === incoming.weightGrams &&
    stored.reps === incoming.reps &&
    stored.durationSeconds === incoming.durationSeconds &&
    stored.distanceMeters === incoming.distanceMeters &&
    stored.rpeTenths === incoming.rpeTenths &&
    stored.isWarmup === incoming.isWarmup
  );
}

/**
 * Una corrección solo toca lo que mide la serie guardada. El esquema no puede comprobarlo porque
 * no sabe de qué tipo es la serie, y dejarlo pasar escribiría kilos en una fila de cardio, que el
 * CHECK de la tabla rechazaría como un 500.
 */
function assertCorrectionFitsKind(stored: SetEntryRow, request: UpdateSetRequest): void {
  const touchesStrength = request.weight !== undefined || request.reps !== undefined;
  const touchesCardio =
    request.durationSeconds !== undefined || request.distanceMeters !== undefined;
  const fits = stored.kind === 'strength' ? !touchesCardio : !touchesStrength;
  if (fits) return;

  throw new ApiException(
    'validation_failed',
    stored.kind === 'strength'
      ? 'Una serie de fuerza no tiene duración ni distancia'
      : 'Una serie de cardio no tiene peso ni repeticiones',
    { setId: stored.id, kind: stored.kind },
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
