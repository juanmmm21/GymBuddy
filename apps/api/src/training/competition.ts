import {
  MAX_RIVALS,
  exerciseDuels,
  formatGramsAsKilograms,
  formatGramsAsVolumeKilograms,
  isoDateOfDay,
  rankWeekTotals,
  weekIndexOf,
  weekStartDayIndex,
  weekTotals,
  type Competition,
  type CompetitionExercise,
  type ExerciseBest,
  type RivalCandidates,
} from '@gymbuddy/shared';
import { and, asc, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { chunk, MAX_PARAMS_PER_LOOKUP } from '../db/batching';
import type { Database } from '../db/client';
import {
  catalogExercise,
  personalRecord,
  rival,
  trackedExercise,
  user,
  type UserRow,
} from '../db/schema';
import { ApiException } from '../http/errors';
import { readWeekDays } from './stats';

/** Lo que hace falta de alguien para ponerle en una clasificación. */
interface Participant {
  readonly userId: string;
  readonly displayName: string;
}

/**
 * A quién puede elegir como rival quien pregunta: las demás cuentas que han activado competir.
 * La cuenta de administración ve a todas —Juan tiene que poder probarlo sin esperar a que nadie
 * lo active—, y por eso cada una lleva `competes`.
 */
export async function listRivalCandidates(db: Database, viewer: UserRow): Promise<RivalCandidates> {
  const rows = await db
    .select({
      userId: user.id,
      displayName: user.displayName,
      competes: user.competes,
      selectedAt: rival.createdAt,
    })
    .from(user)
    .leftJoin(rival, and(eq(rival.userId, viewer.id), eq(rival.rivalUserId, user.id)))
    .where(and(ne(user.id, viewer.id), canBeRivalOf(viewer)))
    .orderBy(asc(user.displayName), asc(user.id));

  return {
    candidates: rows.map((row) => ({
      userId: row.userId,
      displayName: row.displayName,
      competes: row.competes,
      selected: row.selectedAt !== null,
    })),
  };
}

/**
 * Deja la lista de rivales tal y como llega: lo que había se sustituye entero, en un solo viaje a
 * la base. Elegir a alguien que no se puede elegir —no existe, no ha activado competir, o es uno
 * mismo— rechaza la petición sin escribir nada, en vez de guardar la lista a medias.
 */
export async function setRivals(
  db: Database,
  viewer: UserRow,
  rivalIds: readonly string[],
  now: Date,
): Promise<RivalCandidates> {
  const { candidates } = await listRivalCandidates(db, viewer);
  const eligible = new Set(candidates.map((candidate) => candidate.userId));
  const rejected = rivalIds.filter((id) => !eligible.has(id));
  if (rejected.length > 0) {
    throw new ApiException('validation_failed', 'Alguno de los rivales no se puede elegir', {
      rivalIds: rejected,
    });
  }

  const clear = db.delete(rival).where(eq(rival.userId, viewer.id));
  if (rivalIds.length === 0) {
    await clear;
  } else {
    const createdAt = now.toISOString();
    await db.batch([
      clear,
      db
        .insert(rival)
        .values(rivalIds.map((rivalUserId) => ({ userId: viewer.id, rivalUserId, createdAt }))),
    ]);
  }

  const selected = new Set(rivalIds);

  return {
    candidates: candidates.map((candidate) => ({
      ...candidate,
      selected: selected.has(candidate.userId),
    })),
  };
}

/**
 * La competición de quien pregunta: la clasificación de la semana en curso con sus rivales y el
 * cara a cara en los ejercicios del catálogo que comparten.
 *
 * Un rival que desactiva competir desaparece de aquí aunque su fila siga en `rival`: el permiso se
 * mira al leer, así que retirarlo surte efecto en el momento y volver a darlo le devuelve a las
 * clasificaciones en las que ya estaba.
 */
export async function getCompetition(
  db: Database,
  viewer: UserRow,
  now: Date,
): Promise<Competition> {
  const rivals = await listActiveRivals(db, viewer);
  const participants: Participant[] = [
    { userId: viewer.id, displayName: viewer.displayName },
    ...rivals,
  ];
  const nameOf = new Map(participants.map((person) => [person.userId, person.displayName]));

  // Una lectura por persona: son pocas (`MAX_RIVALS`) y es la misma consulta del calendario de Hoy.
  const [weeks, bests] = await Promise.all([
    Promise.all(participants.map((person) => readWeekDays(db, person.userId, now))),
    rivals.length === 0
      ? Promise.resolve<ExerciseBest[]>([])
      : listExerciseBests(
          db,
          participants.map((person) => person.userId),
        ),
  ]);

  const week = rankWeekTotals(
    participants.map((person, index) => ({ ...person, ...weekTotals(weeks[index] ?? []) })),
  ).map((standing) => ({
    userId: standing.userId,
    displayName: standing.displayName,
    isSelf: standing.userId === viewer.id,
    rank: standing.rank,
    daysTrained: standing.daysTrained,
    setCount: standing.setCount,
    volume: formatGramsAsVolumeKilograms(standing.volumeGrams),
  }));

  const duels = exerciseDuels(bests, viewer.id);
  const catalog = await findCatalogNames(
    db,
    duels.map((duel) => duel.catalogId),
  );

  const exercises: CompetitionExercise[] = [];
  for (const duel of duels) {
    const entry = catalog.get(duel.catalogId);
    // Un ejercicio que el catálogo ha perdido no tiene nombre común con el que compararlo.
    if (entry === undefined) continue;

    exercises.push({
      catalogId: duel.catalogId,
      name: viewer.locale === 'es' ? entry.nameEs : entry.nameEn,
      gifUrl: entry.gifUrl,
      entries: duel.entries.map((best) => ({
        userId: best.userId,
        displayName: nameOf.get(best.userId) ?? '',
        isSelf: best.userId === viewer.id,
        maxWeight: formatGramsAsKilograms(best.maxWeightGrams),
        estimatedOneRepMax: formatGramsAsKilograms(best.estimatedOneRepMaxGrams),
      })),
    });
  }
  exercises.sort((a, b) => a.name.localeCompare(b.name, viewer.locale));

  return {
    generatedAt: now.toISOString(),
    weekStart: isoDateOfDay(weekStartDayIndex(weekIndexOf(now.getTime()))),
    week,
    exercises,
  };
}

/** La condición que decide a quién puede ver quien pregunta: a quien compite, o a todos si administra. */
function canBeRivalOf(viewer: UserRow) {
  return viewer.isAdmin ? undefined : eq(user.competes, true);
}

async function listActiveRivals(db: Database, viewer: UserRow): Promise<Participant[]> {
  return db
    .select({ userId: user.id, displayName: user.displayName })
    .from(rival)
    .innerJoin(user, eq(user.id, rival.rivalUserId))
    .where(and(eq(rival.userId, viewer.id), canBeRivalOf(viewer)))
    .orderBy(asc(user.displayName), asc(user.id))
    .limit(MAX_RIVALS);
}

/**
 * Las marcas vigentes de cada participante en sus ejercicios del catálogo. La tabla de marcas
 * guarda cada récord batido, así que la vigente de cada tipo es la mayor. Los archivados no
 * cuentan —ya no se hacen—, y tampoco una marca de cero kilos: en peso corporal no hay nada que
 * comparar.
 */
async function listExerciseBests(
  db: Database,
  userIds: readonly string[],
): Promise<ExerciseBest[]> {
  const maxWeightGrams = sql<
    number | null
  >`max(case when ${personalRecord.kind} = 'max_weight' then ${personalRecord.valueGrams} end)`;
  const estimatedOneRepMaxGrams = sql<
    number | null
  >`max(case when ${personalRecord.kind} = 'estimated_1rm' then ${personalRecord.valueGrams} end)`;

  const rows = await db
    .select({
      userId: trackedExercise.userId,
      catalogId: trackedExercise.catalogId,
      maxWeightGrams,
      estimatedOneRepMaxGrams,
    })
    .from(personalRecord)
    .innerJoin(trackedExercise, eq(trackedExercise.id, personalRecord.trackedExerciseId))
    .where(
      and(
        inArray(trackedExercise.userId, [...userIds]),
        isNotNull(trackedExercise.catalogId),
        isNull(trackedExercise.archivedAt),
      ),
    )
    .groupBy(trackedExercise.userId, trackedExercise.catalogId);

  const bests: ExerciseBest[] = [];
  for (const row of rows) {
    if (row.catalogId === null) continue;
    const oneRepMax = row.estimatedOneRepMaxGrams ?? 0;
    if (oneRepMax <= 0) continue;

    bests.push({
      userId: row.userId,
      catalogId: row.catalogId,
      maxWeightGrams: row.maxWeightGrams ?? 0,
      estimatedOneRepMaxGrams: oneRepMax,
    });
  }

  return bests;
}

interface CatalogName {
  readonly nameEs: string;
  readonly nameEn: string;
  readonly gifUrl: string;
}

async function findCatalogNames(
  db: Database,
  catalogIds: readonly string[],
): Promise<Map<string, CatalogName>> {
  const names = new Map<string, CatalogName>();

  for (const ids of chunk(catalogIds, MAX_PARAMS_PER_LOOKUP)) {
    const rows = await db
      .select({
        catalogId: catalogExercise.catalogId,
        nameEs: catalogExercise.nameEs,
        nameEn: catalogExercise.nameEn,
        gifUrl: catalogExercise.gifUrl,
      })
      .from(catalogExercise)
      .where(inArray(catalogExercise.catalogId, ids));

    for (const row of rows) names.set(row.catalogId, row);
  }

  return names;
}
