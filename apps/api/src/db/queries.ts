import { EPLEY_REP_DIVISOR } from '@gymbuddy/shared';
import { and, asc, desc, eq, getTableColumns, gt, gte, inArray, lt, ne, sql } from 'drizzle-orm';
import type { Database } from './client';
import {
  catalogExercise,
  personalRecord,
  setEntry,
  trackedExercise,
  workoutSession,
  type SetEntryRow,
} from './schema';

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
 * Una serie dentro de una ventana de tiempo, con la parte del cuerpo de su ejercicio ya
 * resuelta. Es texto crudo de SQLite: quien la consume la valida contra el enum del
 * contrato, igual que hace la ficha de un ejercicio.
 */
export interface WindowSetRow {
  sessionStartedAt: string;
  bodyPart: string | null;
  weightGrams: number;
  reps: number;
  isWarmup: boolean;
  completedAt: string;
}

/**
 * Las series de las sesiones **empezadas** dentro de una ventana, con la parte del cuerpo
 * de cada una. Es lo que le falta a `GET /history/sessions` para poder decir qué se
 * trabajó cada día: la sesión sabe cuándo fue, pero no qué se tocó en ella.
 *
 * La ventana filtra por el comienzo de la sesión y no por el de la serie, para que una
 * sesión que cruza la medianoche cuente entera en su día. El `left join` con el catálogo
 * es lo que deja pasar los ejercicios propios: los suyos traen `custom_body_part`, que
 * puede ser nulo, y esa fila tiene que llegar igual.
 */
export async function listSetsInWindow(
  db: Database,
  userId: string,
  from: string,
  to: string,
  limit: number,
): Promise<WindowSetRow[]> {
  const rows = await db
    .select({
      sessionStartedAt: workoutSession.startedAt,
      catalogBodyPart: catalogExercise.bodyPart,
      customBodyPart: trackedExercise.customBodyPart,
      weightGrams: setEntry.weightGrams,
      reps: setEntry.reps,
      isWarmup: setEntry.isWarmup,
      completedAt: setEntry.completedAt,
    })
    .from(setEntry)
    .innerJoin(workoutSession, eq(workoutSession.id, setEntry.sessionId))
    .innerJoin(trackedExercise, eq(trackedExercise.id, setEntry.trackedExerciseId))
    .leftJoin(catalogExercise, eq(catalogExercise.catalogId, trackedExercise.catalogId))
    .where(
      and(
        eq(workoutSession.userId, userId),
        gte(workoutSession.startedAt, from),
        lt(workoutSession.startedAt, to),
      ),
    )
    .orderBy(asc(workoutSession.startedAt), asc(setEntry.orderIndex))
    .limit(limit);

  return rows.map((row) => ({
    sessionStartedAt: row.sessionStartedAt,
    // El catálogo manda sobre la clasificación propia, igual que en la ficha del ejercicio.
    bodyPart: row.catalogBodyPart ?? row.customBodyPart,
    weightGrams: row.weightGrams,
    reps: row.reps,
    isWarmup: row.isWarmup,
    completedAt: row.completedAt,
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

/** La serie efectiva más pesada de una sesión, tal y como sale de la base. */
export interface SessionTopSetRow {
  trackedExerciseId: string;
  sessionId: string;
  startedAt: string;
  weightGrams: number;
  reps: number;
}

/**
 * Las marcas máximas que ya alcanzó el historial de un ejercicio, en una sola consulta.
 * El 1RM viaja como numerador de Epley (`w × (30 + reps)`) porque ordenar por él ordena
 * igual que por el 1RM: así el máximo lo halla SQL y no hace falta leer todas las series.
 */
export interface RecordBestsRow {
  maxWeightGrams: number | null;
  maxEpleyNumerator: number | null;
  maxVolumeGrams: number | null;
}

/**
 * La serie más pesada de cada una de las últimas `sessionLimit` sesiones de cada ejercicio.
 * Es el dato del que salen el peso habitual y el estancamiento, y va en una sola consulta
 * con `row_number()`: leer el historial entero para quedarse con cinco filas por ejercicio
 * haría crecer las filas leídas de D1 con los años.
 */
export async function listTopSetsPerSession(
  db: Database,
  userId: string,
  sessionLimit: number,
  trackedExerciseId?: string,
): Promise<SessionTopSetRow[]> {
  const perSession = db
    .select({
      trackedExerciseId: setEntry.trackedExerciseId,
      sessionId: setEntry.sessionId,
      startedAt: workoutSession.startedAt,
      // El grupo nunca está vacío, así que el máximo no puede ser nulo.
      weightGrams: sql<number>`max(${setEntry.weightGrams})`.as('top_weight_grams'),
      // SQLite devuelve las columnas sueltas de la fila que alcanza el único `max()` del
      // grupo: estas son las repeticiones de esa misma serie, sin un segundo recorrido.
      reps: sql<number>`${setEntry.reps}`.as('top_reps'),
    })
    .from(setEntry)
    .innerJoin(workoutSession, eq(workoutSession.id, setEntry.sessionId))
    .where(
      and(
        eq(workoutSession.userId, userId),
        eq(setEntry.isWarmup, false),
        trackedExerciseId === undefined
          ? undefined
          : eq(setEntry.trackedExerciseId, trackedExerciseId),
      ),
    )
    .groupBy(setEntry.trackedExerciseId, setEntry.sessionId)
    .as('per_session');

  const ranked = db
    .select({
      trackedExerciseId: perSession.trackedExerciseId,
      sessionId: perSession.sessionId,
      startedAt: perSession.startedAt,
      weightGrams: perSession.weightGrams,
      reps: perSession.reps,
      // El identificador desempata: dos sesiones pueden compartir el instante de comienzo
      // y sin desempate la ventana devolvería un orden distinto en cada consulta.
      position:
        sql<number>`row_number() over (partition by ${perSession.trackedExerciseId} order by ${perSession.startedAt} desc, ${perSession.sessionId} desc)`.as(
          'position',
        ),
    })
    .from(perSession)
    .as('ranked');

  return (
    db
      .select({
        trackedExerciseId: ranked.trackedExerciseId,
        sessionId: ranked.sessionId,
        startedAt: ranked.startedAt,
        weightGrams: ranked.weightGrams,
        reps: ranked.reps,
      })
      .from(ranked)
      // `position` es un alias de la ventana, no una columna, así que se referencia en crudo.
      .where(sql`${ranked.position} <= ${sessionLimit}`)
      .orderBy(ranked.trackedExerciseId, sql`${ranked.position}`)
  );
}

/**
 * Las marcas del historial de un ejercicio, saltándose una serie concreta. La exclusión es
 * lo que permite preguntar "¿qué había antes de esta?" cuando la serie ya está insertada,
 * que es el caso del reenvío de la cola offline.
 */
export async function findRecordBests(
  db: Database,
  userId: string,
  trackedExerciseId: string,
  excludeSetId: string,
): Promise<RecordBestsRow> {
  const [row] = await db
    .select({
      maxWeightGrams: sql<number | null>`max(${setEntry.weightGrams})`,
      maxEpleyNumerator: sql<
        number | null
      >`max(${setEntry.weightGrams} * (${EPLEY_REP_DIVISOR} + ${setEntry.reps}))`,
      maxVolumeGrams: sql<number | null>`max(${setEntry.weightGrams} * ${setEntry.reps})`,
    })
    .from(setEntry)
    .innerJoin(workoutSession, eq(workoutSession.id, setEntry.sessionId))
    .where(
      and(
        eq(workoutSession.userId, userId),
        eq(setEntry.trackedExerciseId, trackedExerciseId),
        eq(setEntry.isWarmup, false),
        // Una serie sin peso no marca récord: las tres magnitudes valdrían cero.
        gt(setEntry.weightGrams, 0),
        ne(setEntry.id, excludeSetId),
      ),
    );

  return row ?? { maxWeightGrams: null, maxEpleyNumerator: null, maxVolumeGrams: null };
}

/**
 * Los récords guardados de un ejercicio, del más reciente al más antiguo dentro de cada
 * tipo. La tabla conserva la historia de marcas —la gráfica de la fase 9 las pinta—, así
 * que la vigente de cada tipo es la primera que aparece aquí.
 */
export async function listRecordsForExercise(
  db: Database,
  userId: string,
  trackedExerciseId: string,
): Promise<(typeof personalRecord.$inferSelect)[]> {
  return db
    .select()
    .from(personalRecord)
    .where(
      and(
        eq(personalRecord.userId, userId),
        eq(personalRecord.trackedExerciseId, trackedExerciseId),
      ),
    )
    .orderBy(personalRecord.kind, desc(personalRecord.valueGrams));
}
