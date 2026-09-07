import { and, asc, desc, eq, getTableColumns, inArray } from 'drizzle-orm';
import type { Database } from './client';
import { setEntry, workoutSession, type SetEntryRow } from './schema';

/** Una sesión pasada junto a las series que contiene de un ejercicio concreto. */
export interface ExerciseSessionHistory {
  sessionId: string;
  startedAt: string;
  endedAt: string | null;
  sets: SetEntryRow[];
}

const setColumns = getTableColumns(setEntry);

/**
 * Las series de una sesión, en el orden en que se registraron. El filtro por usuario va
 * en el join: el identificador de sesión viaja en la URL y no puede ser la única llave.
 */
export async function listSetsForSession(
  db: Database,
  userId: string,
  sessionId: string,
): Promise<SetEntryRow[]> {
  return db
    .select(setColumns)
    .from(setEntry)
    .innerJoin(workoutSession, eq(setEntry.sessionId, workoutSession.id))
    .where(and(eq(setEntry.sessionId, sessionId), eq(workoutSession.userId, userId)))
    .orderBy(asc(setEntry.orderIndex));
}

/**
 * Las últimas `sessionLimit` sesiones en las que se trabajó un ejercicio, de la más
 * reciente a la más antigua. Va en dos consultas —primero las sesiones, después sus
 * series— para no leer el historial entero del ejercicio en cada llamada: D1 cobra por
 * filas leídas y una consulta que crece con los años acaba mordiendo el límite diario.
 */
export async function listExerciseHistory(
  db: Database,
  userId: string,
  trackedExerciseId: string,
  sessionLimit: number,
): Promise<ExerciseSessionHistory[]> {
  const sessions = await db
    .selectDistinct({
      id: workoutSession.id,
      startedAt: workoutSession.startedAt,
      endedAt: workoutSession.endedAt,
    })
    .from(workoutSession)
    .innerJoin(setEntry, eq(setEntry.sessionId, workoutSession.id))
    .where(
      and(eq(workoutSession.userId, userId), eq(setEntry.trackedExerciseId, trackedExerciseId)),
    )
    .orderBy(desc(workoutSession.startedAt))
    .limit(sessionLimit);

  if (sessions.length === 0) return [];

  const sets = await db
    .select(setColumns)
    .from(setEntry)
    .where(
      and(
        eq(setEntry.trackedExerciseId, trackedExerciseId),
        inArray(
          setEntry.sessionId,
          sessions.map((session) => session.id),
        ),
      ),
    )
    .orderBy(asc(setEntry.orderIndex));

  const setsBySession = new Map<string, SetEntryRow[]>();
  for (const set of sets) {
    const existing = setsBySession.get(set.sessionId);
    if (existing === undefined) {
      setsBySession.set(set.sessionId, [set]);
    } else {
      existing.push(set);
    }
  }

  return sessions.map((session) => ({
    sessionId: session.id,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    sets: setsBySession.get(session.id) ?? [],
  }));
}

/**
 * La última vez que se hizo un ejercicio. Es lo que precarga el peso al añadir una serie:
 * sin esto el usuario reescribe en cada sesión lo que ya levantó la semana pasada.
 */
export async function findLastSessionForExercise(
  db: Database,
  userId: string,
  trackedExerciseId: string,
): Promise<ExerciseSessionHistory | null> {
  const [last] = await listExerciseHistory(db, userId, trackedExerciseId, 1);
  return last ?? null;
}
