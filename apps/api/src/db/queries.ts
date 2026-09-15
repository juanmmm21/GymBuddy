import { EPLEY_REP_DIVISOR } from '@gymbuddy/shared';
import { and, asc, desc, eq, getTableColumns, gt, gte, inArray, lt, ne, sql } from 'drizzle-orm';
import { chunk, MAX_PARAMS_PER_LOOKUP } from './batching';
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
 * Solo las series de fuerza. Todo lo que se mide en gramos —peso habitual, marcas, la última
 * serie que precarga el registro— filtra por aquí, y es lo que permite leer `weight_grams` y
 * `reps` como no nulos: el CHECK `set_entry_kind_shape` los exige en este tipo.
 */
const isStrengthSet = eq(setEntry.kind, 'strength');
const strengthWeightGrams = sql<number>`${setEntry.weightGrams}`;
const strengthReps = sql<number>`${setEntry.reps}`;

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
  id: string;
  sessionStartedAt: string;
  bodyPart: string | null;
  kind: 'strength' | 'cardio';
  weightGrams: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  isWarmup: boolean;
  completedAt: string;
  unilateral: boolean;
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
      id: setEntry.id,
      sessionStartedAt: workoutSession.startedAt,
      catalogBodyPart: catalogExercise.bodyPart,
      customBodyPart: trackedExercise.customBodyPart,
      kind: setEntry.kind,
      weightGrams: setEntry.weightGrams,
      reps: setEntry.reps,
      durationSeconds: setEntry.durationSeconds,
      distanceMeters: setEntry.distanceMeters,
      isWarmup: setEntry.isWarmup,
      completedAt: setEntry.completedAt,
      unilateral: trackedExercise.unilateral,
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
    id: row.id,
    sessionStartedAt: row.sessionStartedAt,
    // El catálogo manda sobre la clasificación propia, igual que en la ficha del ejercicio.
    bodyPart: row.catalogBodyPart ?? row.customBodyPart,
    kind: row.kind,
    weightGrams: row.weightGrams,
    reps: row.reps,
    durationSeconds: row.durationSeconds,
    distanceMeters: row.distanceMeters,
    isWarmup: row.isWarmup,
    completedAt: row.completedAt,
    unilateral: row.unilateral,
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
        isStrengthSet,
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

export interface LastEffectiveSetRow {
  trackedExerciseId: string;
  weightGrams: number;
  reps: number;
  completedAt: string;
}

/**
 * La última serie efectiva de cada ejercicio del usuario, sin calentamiento: una fila por
 * ejercicio en una sola consulta, no su historial entero. Se ordena por `completed_at` como texto
 * porque la PWA la sella en UTC (`toISOString`); el `order_index` y el id desempatan dos series del
 * mismo instante para que el resultado no cambie de una consulta a otra.
 */
export async function listLastEffectiveSets(
  db: Database,
  userId: string,
  trackedExerciseId?: string,
): Promise<LastEffectiveSetRow[]> {
  const ranked = db
    .select({
      trackedExerciseId: setEntry.trackedExerciseId,
      weightGrams: strengthWeightGrams.as('weight_grams'),
      reps: strengthReps.as('reps'),
      completedAt: setEntry.completedAt,
      position:
        sql<number>`row_number() over (partition by ${setEntry.trackedExerciseId} order by ${setEntry.completedAt} desc, ${setEntry.orderIndex} desc, ${setEntry.id} desc)`.as(
          'position',
        ),
    })
    .from(setEntry)
    .innerJoin(workoutSession, eq(workoutSession.id, setEntry.sessionId))
    .where(
      and(
        eq(workoutSession.userId, userId),
        isStrengthSet,
        eq(setEntry.isWarmup, false),
        trackedExerciseId === undefined
          ? undefined
          : eq(setEntry.trackedExerciseId, trackedExerciseId),
      ),
    )
    .as('ranked');

  return db
    .select({
      trackedExerciseId: ranked.trackedExerciseId,
      weightGrams: ranked.weightGrams,
      reps: ranked.reps,
      completedAt: ranked.completedAt,
    })
    .from(ranked)
    .where(sql`${ranked.position} = 1`);
}

export interface LastCardioSetRow {
  trackedExerciseId: string;
  durationSeconds: number;
  distanceMeters: number | null;
  completedAt: string;
}

/**
 * La última serie de cardio de cada ejercicio, sin calentamiento, con el mismo orden y los mismos
 * desempates que `listLastEffectiveSets`. Va en otra consulta y no en una ventana por tipo porque
 * cada una lee columnas distintas y así ninguna tiene que devolver nulos que el tipo no espera.
 */
export async function listLastCardioSets(
  db: Database,
  userId: string,
  trackedExerciseId?: string,
): Promise<LastCardioSetRow[]> {
  const ranked = db
    .select({
      trackedExerciseId: setEntry.trackedExerciseId,
      // La restricción `set_entry_kind_shape` garantiza la duración en una serie de cardio.
      durationSeconds: sql<number>`${setEntry.durationSeconds}`.as('duration_seconds'),
      distanceMeters: setEntry.distanceMeters,
      completedAt: setEntry.completedAt,
      position:
        sql<number>`row_number() over (partition by ${setEntry.trackedExerciseId} order by ${setEntry.completedAt} desc, ${setEntry.orderIndex} desc, ${setEntry.id} desc)`.as(
          'position',
        ),
    })
    .from(setEntry)
    .innerJoin(workoutSession, eq(workoutSession.id, setEntry.sessionId))
    .where(
      and(
        eq(workoutSession.userId, userId),
        eq(setEntry.kind, 'cardio'),
        eq(setEntry.isWarmup, false),
        trackedExerciseId === undefined
          ? undefined
          : eq(setEntry.trackedExerciseId, trackedExerciseId),
      ),
    )
    .as('ranked_cardio');

  return db
    .select({
      trackedExerciseId: ranked.trackedExerciseId,
      durationSeconds: ranked.durationSeconds,
      distanceMeters: ranked.distanceMeters,
      completedAt: ranked.completedAt,
    })
    .from(ranked)
    .where(sql`${ranked.position} = 1`);
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
      // El volumen de una serie a un brazo cuenta los dos lados, igual que `setVolumeGrams`.
      maxVolumeGrams: sql<
        number | null
      >`max(${setEntry.weightGrams} * ${setEntry.reps} * (case when ${trackedExercise.unilateral} then 2 else 1 end))`,
    })
    .from(setEntry)
    .innerJoin(workoutSession, eq(workoutSession.id, setEntry.sessionId))
    .innerJoin(trackedExercise, eq(trackedExercise.id, setEntry.trackedExerciseId))
    .where(
      and(
        eq(workoutSession.userId, userId),
        eq(setEntry.trackedExerciseId, trackedExerciseId),
        isStrengthSet,
        eq(setEntry.isWarmup, false),
        // Una serie sin peso no marca récord: las tres magnitudes valdrían cero.
        gt(setEntry.weightGrams, 0),
        ne(setEntry.id, excludeSetId),
      ),
    );

  return row ?? { maxWeightGrams: null, maxEpleyNumerator: null, maxVolumeGrams: null };
}

/**
 * Si un ejercicio del usuario es a un brazo. Lo pide el registro de marcas, que solo tiene la serie:
 * de eso depende su volumen. Un ejercicio que no existe responde falso; quien registra ya comprobó
 * antes que es suyo.
 */
export async function findTrackedExerciseUnilateral(
  db: Database,
  userId: string,
  trackedExerciseId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ unilateral: trackedExercise.unilateral })
    .from(trackedExercise)
    .where(and(eq(trackedExercise.id, trackedExerciseId), eq(trackedExercise.userId, userId)))
    .limit(1);

  return row?.unilateral ?? false;
}

/** Una serie que puede marcar récord, con lo que hace falta para recorrerlas en orden. */
export interface RecordReplaySetRow {
  id: string;
  trackedExerciseId: string;
  orderIndex: number;
  weightGrams: number;
  reps: number;
  isWarmup: boolean;
  completedAt: string;
  unilateral: boolean;
}

/**
 * Las series que pueden marcar récord de unos ejercicios: de fuerza, sin calentamiento y con peso, que son
 * las únicas que `detectPersonalRecords` tiene en cuenta. Solo se pide al borrar, que es raro, y
 * la PWA nunca manda más ejercicios que los de una sesión; aun así se trocea por los cien
 * parámetros de D1.
 */
export async function listRecordReplaySets(
  db: Database,
  userId: string,
  trackedExerciseIds: readonly string[],
): Promise<RecordReplaySetRow[]> {
  const rows: RecordReplaySetRow[] = [];
  for (const ids of chunk(trackedExerciseIds, MAX_PARAMS_PER_LOOKUP)) {
    rows.push(
      ...(await db
        .select({
          id: setEntry.id,
          trackedExerciseId: setEntry.trackedExerciseId,
          orderIndex: setEntry.orderIndex,
          weightGrams: strengthWeightGrams,
          reps: strengthReps,
          isWarmup: setEntry.isWarmup,
          completedAt: setEntry.completedAt,
          unilateral: trackedExercise.unilateral,
        })
        .from(setEntry)
        .innerJoin(workoutSession, eq(workoutSession.id, setEntry.sessionId))
        .innerJoin(trackedExercise, eq(trackedExercise.id, setEntry.trackedExerciseId))
        .where(
          and(
            eq(workoutSession.userId, userId),
            inArray(setEntry.trackedExerciseId, ids),
            isStrengthSet,
            eq(setEntry.isWarmup, false),
            gt(setEntry.weightGrams, 0),
          ),
        )),
    );
  }

  return rows;
}

/** Las marcas guardadas de unos ejercicios, troceado igual que sus series. */
export async function listRecordsForExercises(
  db: Database,
  userId: string,
  trackedExerciseIds: readonly string[],
): Promise<(typeof personalRecord.$inferSelect)[]> {
  const rows: (typeof personalRecord.$inferSelect)[] = [];
  for (const ids of chunk(trackedExerciseIds, MAX_PARAMS_PER_LOOKUP)) {
    rows.push(
      ...(await db
        .select()
        .from(personalRecord)
        .where(
          and(eq(personalRecord.userId, userId), inArray(personalRecord.trackedExerciseId, ids)),
        )),
    );
  }

  return rows;
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
