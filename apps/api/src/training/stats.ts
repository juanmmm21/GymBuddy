import {
  DAYS_PER_WEEK,
  WORKING_WEIGHT_SESSIONS,
  daysSinceLastSession,
  detectStagnation,
  formatGramsAsKilograms,
  formatGramsAsVolumeKilograms,
  isoDateOfDay,
  progressionPoints,
  sessionsThisWeek,
  suggestedIncrementGrams,
  summarizeWorkingWeight,
  topSetsBySession,
  weekIndexOf,
  weekStartDayIndex,
  weeklyBodyPartCalendar,
  weeklyStreak,
  type ExerciseStats,
  type PersonalRecord,
  type ProgressionSession,
  type ProgressionSet,
  type SessionTopSet,
  type StalledExercise,
  type TrainingSignals,
  type WeeklyCalendar,
  type WeekSetEntry,
} from '@gymbuddy/shared';
import { and, desc, eq, gte, isNull } from 'drizzle-orm';
import type { Database } from '../db/client';
import { listExerciseHistory, listSetsInWindow, listTopSetsPerSession } from '../db/queries';
import { personalRecord, workoutSession, type SetEntryRow } from '../db/schema';
import {
  listTrackedExerciseFacts,
  parseNullableBodyPart,
  requireTrackedExerciseFacts,
} from './exercises';
import { getCurrentRecords, toPersonalRecord } from './records';
import { listRoutineRepRanges } from './routines';

/**
 * Ventana de la que salen la racha y las sesiones de la semana. Un año cubre cualquier
 * racha real y acota lo que se lee de D1: sin tope, la consulta crecería con los años.
 */
const SIGNAL_WINDOW_WEEKS = 52;
const MAX_SIGNAL_SESSIONS = 400;
const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * Tope de series que se leen para el calendario. Una semana muy cargada son unas
 * doscientas; el límite está para que una semana absurda no se coma filas de D1, y al
 * alcanzarlo se pierde lo último del domingo, no el reparto de los días anteriores.
 */
const MAX_WEEK_SETS = 500;

/**
 * Todo lo que la pantalla de un ejercicio sabe decir de él: peso habitual, marcas vigentes,
 * los puntos de la gráfica y si lleva demasiadas sesiones atascado en el mismo peso.
 */
export async function getExerciseStats(
  db: Database,
  userId: string,
  trackedExerciseId: string,
  sessionLimit: number,
): Promise<ExerciseStats> {
  // Va primero: un ejercicio ajeno tiene que responder 404 antes de leer nada suyo.
  const facts = await requireTrackedExerciseFacts(db, userId, trackedExerciseId);

  const [history, records, repRanges] = await Promise.all([
    listExerciseHistory(db, userId, trackedExerciseId, sessionLimit),
    getCurrentRecords(db, userId, trackedExerciseId),
    listRoutineRepRanges(db, userId, trackedExerciseId),
  ]);

  const sessions: ProgressionSession[] = history.map((entry) => ({
    sessionId: entry.sessionId,
    startedAt: entry.startedAt,
    sets: entry.sets.map(toProgressionSet),
  }));

  const topSets = topSetsBySession(sessions);
  const summary = summarizeWorkingWeight(topSets, WORKING_WEIGHT_SESSIONS);
  const stagnation = detectStagnation(
    topSets,
    facts.bodyPart,
    repRanges.get(trackedExerciseId) ?? null,
  );

  return {
    trackedExerciseId,
    workingWeight:
      summary === null
        ? null
        : {
            weight: formatGramsAsKilograms(summary.weightGrams),
            reps: summary.reps,
            lastPerformedAt: summary.lastPerformedAt,
            sessionCount: summary.sessionCount,
          },
    records,
    points: progressionPoints(sessions).map((point) => ({
      sessionId: point.sessionId,
      startedAt: point.startedAt,
      topWeight: formatGramsAsKilograms(point.topWeightGrams),
      topReps: point.topReps,
      estimatedOneRepMax: formatGramsAsKilograms(point.estimatedOneRepMaxGrams),
      volume: formatGramsAsVolumeKilograms(point.volumeGrams),
      totalReps: point.totalReps,
      setCount: point.setCount,
    })),
    stalled:
      stagnation === null
        ? null
        : {
            trackedExerciseId,
            weight: formatGramsAsKilograms(stagnation.weightGrams),
            sessions: stagnation.sessions,
            suggestedIncrement: formatGramsAsKilograms(stagnation.suggestedIncrementGrams),
          },
  };
}

/**
 * Las señales del usuario entero: cuánto lleva sin aparecer, su racha, si tiene una sesión
 * abierta, cuál fue su último récord y qué ejercicios están atascados. Es la entrada de la
 * mascota (fase 11), así que se calcula de una vez y no ejercicio a ejercicio.
 */
export async function getTrainingSignals(
  db: Database,
  userId: string,
  now: Date,
): Promise<TrainingSignals> {
  const windowStart = new Date(
    now.getTime() - SIGNAL_WINDOW_WEEKS * DAYS_PER_WEEK * MILLISECONDS_PER_DAY,
  ).toISOString();

  // Las cuatro son consultas pequeñas y sin relación entre sí: un solo viaje a D1.
  const [recent, last, active, latestRecords] = await db.batch([
    db
      .select({ startedAt: workoutSession.startedAt })
      .from(workoutSession)
      .where(and(eq(workoutSession.userId, userId), gte(workoutSession.startedAt, windowStart)))
      .orderBy(desc(workoutSession.startedAt))
      .limit(MAX_SIGNAL_SESSIONS),
    // La última sesión se pide aparte de la ventana: quien lleva dos años sin entrenar
    // tiene que ver "hace 730 días", no un hueco donde debería estar el dato.
    db
      .select({ startedAt: workoutSession.startedAt })
      .from(workoutSession)
      .where(eq(workoutSession.userId, userId))
      .orderBy(desc(workoutSession.startedAt))
      .limit(1),
    db
      .select({ id: workoutSession.id })
      .from(workoutSession)
      .where(and(eq(workoutSession.userId, userId), isNull(workoutSession.endedAt)))
      .orderBy(desc(workoutSession.startedAt))
      .limit(1),
    db
      .select()
      .from(personalRecord)
      .where(eq(personalRecord.userId, userId))
      .orderBy(desc(personalRecord.achievedAt))
      .limit(1),
  ]);

  const starts = recent.map((row) => row.startedAt);
  const lastSessionAt = last[0]?.startedAt ?? null;
  const latestRecord: PersonalRecord | null =
    latestRecords[0] === undefined ? null : toPersonalRecord(latestRecords[0]);

  return {
    generatedAt: now.toISOString(),
    lastSessionAt,
    daysSinceLastSession: daysSinceLastSession(lastSessionAt, now),
    weeklyStreak: weeklyStreak(starts, now),
    sessionsThisWeek: sessionsThisWeek(starts, now),
    activeSessionId: active[0]?.id ?? null,
    latestRecord,
    stalled: await findStalledExercises(db, userId),
  };
}

/**
 * El mini calendario de la semana en curso: los siete días con la parte del cuerpo que más
 * volumen tuvo en cada uno. Va aparte de `GET /stats/signals` a propósito: las señales las
 * pide también la mascota, y leer las series de la semana entera en cada una de esas
 * llamadas sería pagar por un dato que solo pinta la pantalla de Hoy.
 */
export async function getWeeklyCalendar(
  db: Database,
  userId: string,
  now: Date,
): Promise<WeeklyCalendar> {
  const weekStart = weekStartDayIndex(weekIndexOf(now.getTime()));
  const from = new Date(weekStart * MILLISECONDS_PER_DAY).toISOString();
  const to = new Date((weekStart + DAYS_PER_WEEK) * MILLISECONDS_PER_DAY).toISOString();

  const rows = await listSetsInWindow(db, userId, from, to, MAX_WEEK_SETS);

  const entries: WeekSetEntry[] = rows.map((row) => ({
    sessionStartedAt: row.sessionStartedAt,
    bodyPart: parseNullableBodyPart(row.bodyPart),
    set: {
      weightGrams: row.weightGrams,
      reps: row.reps,
      isWarmup: row.isWarmup,
      completedAt: row.completedAt,
    },
  }));

  return {
    generatedAt: now.toISOString(),
    weekStart: isoDateOfDay(weekStart),
    days: weeklyBodyPartCalendar(entries, now).map((day) => ({
      dayIndex: day.dayIndex,
      date: day.date,
      trained: day.trained,
      bodyPart: day.bodyPart,
      volume: formatGramsAsVolumeKilograms(day.volumeGrams),
      setCount: day.setCount,
    })),
  };
}

/**
 * Los ejercicios atascados en el mismo peso. El estancamiento se detecta sin la parte del
 * cuerpo y solo después se buscan las de los pocos que salgan: pedirla para todos obligaría
 * a un join que casi nunca hace falta. Los archivados no cuentan: ya no se hacen.
 *
 * Los rangos de las rutinas, en cambio, se leen antes de detectar y para todos: un rango
 * puede hacer saltar un estancamiento que sin él no salía, así que no basta con pedirlos
 * para los candidatos.
 */
async function findStalledExercises(db: Database, userId: string): Promise<StalledExercise[]> {
  const [rows, repRanges] = await Promise.all([
    listTopSetsPerSession(db, userId, WORKING_WEIGHT_SESSIONS),
    listRoutineRepRanges(db, userId),
  ]);

  const topSetsByExercise = new Map<string, SessionTopSet[]>();
  for (const row of rows) {
    const entry: SessionTopSet = {
      sessionId: row.sessionId,
      startedAt: row.startedAt,
      weightGrams: row.weightGrams,
      reps: row.reps,
    };

    const existing = topSetsByExercise.get(row.trackedExerciseId);
    if (existing === undefined) {
      topSetsByExercise.set(row.trackedExerciseId, [entry]);
    } else {
      existing.push(entry);
    }
  }

  const candidates = new Map<string, { weightGrams: number; sessions: number }>();
  for (const [trackedExerciseId, topSets] of topSetsByExercise) {
    const signal = detectStagnation(topSets, null, repRanges.get(trackedExerciseId) ?? null);
    if (signal !== null) {
      candidates.set(trackedExerciseId, {
        weightGrams: signal.weightGrams,
        sessions: signal.sessions,
      });
    }
  }

  const facts = await listTrackedExerciseFacts(db, userId, [...candidates.keys()]);

  return [...candidates]
    .filter(([trackedExerciseId]) => facts.get(trackedExerciseId)?.archived === false)
    .map(([trackedExerciseId, candidate]) => ({
      trackedExerciseId,
      weight: formatGramsAsKilograms(candidate.weightGrams),
      sessions: candidate.sessions,
      suggestedIncrement: formatGramsAsKilograms(
        suggestedIncrementGrams(facts.get(trackedExerciseId)?.bodyPart ?? null),
      ),
    }));
}

function toProgressionSet(row: SetEntryRow): ProgressionSet {
  return {
    weightGrams: row.weightGrams,
    reps: row.reps,
    isWarmup: row.isWarmup,
    completedAt: row.completedAt,
  };
}
