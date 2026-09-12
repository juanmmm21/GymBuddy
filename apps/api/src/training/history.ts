import type { ExerciseHistory, WorkoutSessionPage } from '@gymbuddy/shared';
import { and, count, desc, eq, gte, lte } from 'drizzle-orm';
import type { Database } from '../db/client';
import { listExerciseHistory } from '../db/queries';
import { setEntry, workoutSession } from '../db/schema';
import { assertTrackedExerciseBelongsToUser } from './exercises';
import { toSetEntry } from './sessions';

export interface SessionPageQuery {
  readonly limit: number;
  readonly offset: number;
  /** Ventana temporal sobre el comienzo de la sesión, ya normalizada a UTC. */
  readonly from: string | undefined;
  readonly to: string | undefined;
}

/**
 * El historial de sesiones, de la más reciente a la más antigua. Cada fila lleva su
 * recuento de series para que la lista se pinte sin traerse el detalle de cada sesión.
 */
export async function listSessionPage(
  db: Database,
  userId: string,
  query: SessionPageQuery,
): Promise<WorkoutSessionPage> {
  const filter = and(
    eq(workoutSession.userId, userId),
    query.from === undefined ? undefined : gte(workoutSession.startedAt, query.from),
    query.to === undefined ? undefined : lte(workoutSession.startedAt, query.to),
  );

  // El total y la página van en un solo viaje a D1: la pantalla de historial se abre a
  // menudo y dos consultas sueltas doblarían su latencia.
  const [totals, rows] = await db.batch([
    db.select({ total: count() }).from(workoutSession).where(filter),
    db
      .select({
        id: workoutSession.id,
        startedAt: workoutSession.startedAt,
        endedAt: workoutSession.endedAt,
        notes: workoutSession.notes,
        setCount: count(setEntry.id),
      })
      .from(workoutSession)
      .leftJoin(setEntry, eq(setEntry.sessionId, workoutSession.id))
      .where(filter)
      .groupBy(workoutSession.id)
      .orderBy(desc(workoutSession.startedAt))
      .limit(query.limit)
      .offset(query.offset),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      notes: row.notes,
      setCount: row.setCount,
    })),
    total: totals[0]?.total ?? 0,
    limit: query.limit,
    offset: query.offset,
  };
}

/**
 * Las últimas `sessionLimit` veces que se hizo un ejercicio, con sus series. Es lo que
 * alimenta la gráfica de progresión y el "cuánto levanté la última vez".
 */
export async function getExerciseHistory(
  db: Database,
  userId: string,
  trackedExerciseId: string,
  sessionLimit: number,
): Promise<ExerciseHistory> {
  // Sin esto, el ejercicio de otro usuario devolvería un historial vacío en vez de un 404,
  // que es una forma silenciosa de confirmar que ese identificador existe.
  await assertTrackedExerciseBelongsToUser(db, userId, trackedExerciseId);

  const sessions = await listExerciseHistory(db, userId, trackedExerciseId, sessionLimit);

  return {
    trackedExerciseId,
    sessions: sessions.map((session) => ({
      sessionId: session.sessionId,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      sets: session.sets.map(toSetEntry),
    })),
  };
}
