import {
  detectPersonalRecords,
  formatGramsAsVolumeKilograms,
  oneRepMaxFromEpleyNumerator,
  replayPersonalRecords,
  type PersonalRecord,
  type PersonalRecordBests,
  type PersonalRecordKind,
  type ProgressionSet,
} from '@gymbuddy/shared';
import { and, eq, inArray } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { chunk, MAX_PARAMS_PER_LOOKUP } from '../db/batching';
import type { Database } from '../db/client';
import {
  findRecordBests,
  listRecordReplaySets,
  listRecordsForExercise,
  listRecordsForExercises,
} from '../db/queries';
import { personalRecord, type PersonalRecordRow, type SetEntryRow } from '../db/schema';
import { setMeasureOf } from './set-measure';

/** Los tres tipos de marca. Estar los tres es lo que hace fiable la tabla como caché. */
const RECORD_KINDS: readonly PersonalRecordKind[] = ['max_weight', 'estimated_1rm', 'max_volume'];

/**
 * Guarda los récords que rompe una serie recién registrada y devuelve los que ha roto,
 * para que la PWA los celebre en el momento en vez de descubrirlos al abrir la pantalla.
 *
 * Se ejecuta también cuando la serie ya existía: si el primer intento insertó la serie y
 * se cayó antes de escribir la marca, el reenvío de la cola offline lo arregla solo. Que
 * no duplique nada lo garantiza la comparación estricta contra las marcas ya guardadas.
 *
 * Una serie de cardio no marca nada: las tres marcas se miden en gramos.
 */
export async function applyPersonalRecords(
  db: Database,
  userId: string,
  row: SetEntryRow,
): Promise<PersonalRecord[]> {
  const measure = setMeasureOf(row);
  if (measure.kind !== 'strength') return [];

  const set: ProgressionSet = {
    weightGrams: measure.weightGrams,
    reps: measure.reps,
    isWarmup: row.isWarmup,
    completedAt: row.completedAt,
  };

  const bests = await findCurrentBests(db, userId, row.trackedExerciseId, row.id);
  const detected = detectPersonalRecords(set, bests);
  if (detected.length === 0) return [];

  const rows: PersonalRecordRow[] = detected.map((record) => ({
    id: crypto.randomUUID(),
    userId,
    trackedExerciseId: row.trackedExerciseId,
    kind: record.kind,
    valueGrams: record.valueGrams,
    setEntryId: row.id,
    achievedAt: row.completedAt,
  }));

  await db.insert(personalRecord).values(rows);

  return rows.map(toPersonalRecord);
}

/** Filas de marca por sentencia de inserción: siete columnas bajo los cien parámetros de D1. */
const RECORD_ROWS_PER_INSERT = 14;

/**
 * Las sentencias que dejan bien las marcas de los ejercicios tocados por un borrado de series, para
 * mandarlas **en el mismo lote** que el borrado: D1 ejecuta un lote como una transacción, así que
 * no puede quedar la serie borrada con las marcas de antes ni al revés.
 *
 * Se calculan antes de borrar y sin las series que se van: por cada ejercicio, desde la más antigua
 * de ellas se retiran las marcas guardadas y se vuelven a escribir las que salen de recorrer lo que
 * queda (`replayPersonalRecords`). Lo anterior no depende de lo borrado y no se toca. El
 * calentamiento, las series sin peso y las de cardio nunca marcaron, así que borrarlos no
 * reescribe nada.
 */
export async function personalRecordRewriteStatements(
  db: Database,
  userId: string,
  removedSets: readonly SetEntryRow[],
): Promise<BatchItem<'sqlite'>[]> {
  const fromByExercise = earliestRecordRemovals(removedSets);
  if (fromByExercise.size === 0) return [];

  const exerciseIds = [...fromByExercise.keys()];
  const removedIds = new Set(removedSets.map((set) => set.id));
  const remainingSets = (await listRecordReplaySets(db, userId, exerciseIds)).filter(
    (set) => !removedIds.has(set.id),
  );
  const storedRecords = await listRecordsForExercises(db, userId, exerciseIds);

  const staleRecordIds: string[] = [];
  const rewritten: PersonalRecordRow[] = [];
  for (const [trackedExerciseId, from] of fromByExercise) {
    const fromMs = Date.parse(from);
    const records = storedRecords.filter(
      (record) => record.trackedExerciseId === trackedExerciseId,
    );
    const kept = records.filter((record) => Date.parse(record.achievedAt) < fromMs);
    staleRecordIds.push(
      ...records.filter((record) => !kept.includes(record)).map((record) => record.id),
    );

    const replayed = replayPersonalRecords(
      remainingSets.filter((set) => set.trackedExerciseId === trackedExerciseId),
      { from, kept: bestsOf(kept) },
    );
    rewritten.push(
      ...replayed.map((record) => ({
        id: crypto.randomUUID(),
        userId,
        trackedExerciseId,
        kind: record.kind,
        valueGrams: record.valueGrams,
        setEntryId: record.setId,
        achievedAt: record.achievedAt,
      })),
    );
  }

  return [
    ...chunk(staleRecordIds, MAX_PARAMS_PER_LOOKUP).map((ids) =>
      db
        .delete(personalRecord)
        .where(and(eq(personalRecord.userId, userId), inArray(personalRecord.id, ids))),
    ),
    ...chunk(rewritten, RECORD_ROWS_PER_INSERT).map((rows) =>
      db.insert(personalRecord).values(rows),
    ),
  ];
}

/**
 * Desde qué serie hay que reescribir las marcas de cada ejercicio: la más antigua de las borradas
 * que podía marcar. Se comparan instantes, no texto, porque el contrato admite desfase horario.
 */
function earliestRecordRemovals(removedSets: readonly SetEntryRow[]): Map<string, string> {
  const earliest = new Map<string, string>();
  for (const set of removedSets) {
    const measure = setMeasureOf(set);
    if (set.isWarmup || measure.kind !== 'strength' || measure.weightGrams <= 0) continue;
    const current = earliest.get(set.trackedExerciseId);
    if (current === undefined || Date.parse(set.completedAt) < Date.parse(current)) {
      earliest.set(set.trackedExerciseId, set.completedAt);
    }
  }
  return earliest;
}

/** El valor más alto de cada tipo entre unas marcas guardadas. */
function bestsOf(records: readonly PersonalRecordRow[]): PersonalRecordBests {
  const highest = (kind: PersonalRecordKind): number | null =>
    records.reduce<number | null>(
      (best, record) =>
        record.kind === kind && (best === null || record.valueGrams > best)
          ? record.valueGrams
          : best,
      null,
    );

  return {
    maxWeightGrams: highest('max_weight'),
    estimatedOneRepMaxGrams: highest('estimated_1rm'),
    maxVolumeGrams: highest('max_volume'),
  };
}

/** Las marcas vigentes de un ejercicio: una por tipo, la de mayor valor. */
export async function getCurrentRecords(
  db: Database,
  userId: string,
  trackedExerciseId: string,
): Promise<PersonalRecord[]> {
  const current = await findCurrentRecordRows(db, userId, trackedExerciseId);

  return [...current.values()].map(toPersonalRecord);
}

export function toPersonalRecord(row: PersonalRecordRow): PersonalRecord {
  return {
    id: row.id,
    trackedExerciseId: row.trackedExerciseId,
    kind: row.kind,
    value: formatGramsAsVolumeKilograms(row.valueGrams),
    setEntryId: row.setEntryId,
    achievedAt: row.achievedAt,
  };
}

/** La marca vigente de cada tipo, indexada por tipo. Puede no haber ninguna. */
async function findCurrentRecordRows(
  db: Database,
  userId: string,
  trackedExerciseId: string,
): Promise<Map<PersonalRecordKind, PersonalRecordRow>> {
  const rows = await listRecordsForExercise(db, userId, trackedExerciseId);
  const current = new Map<PersonalRecordKind, PersonalRecordRow>();

  // Vienen ordenadas por tipo y valor descendente, así que la primera de cada tipo manda.
  for (const row of rows) {
    if (!current.has(row.kind)) current.set(row.kind, row);
  }

  return current;
}

/**
 * Las marcas contra las que se compara. Salen de `personal_record`, que es la tabla que
 * las mantiene, salvo cuando aún no están las tres: ahí se calculan una sola vez sobre las
 * series ya registradas. Sin eso, la primera serie floja de alguien con historial previo
 * se coronaría récord solo porque la tabla acababa de estrenarse para ese ejercicio.
 */
async function findCurrentBests(
  db: Database,
  userId: string,
  trackedExerciseId: string,
  excludeSetId: string,
): Promise<PersonalRecordBests> {
  const current = await findCurrentRecordRows(db, userId, trackedExerciseId);
  if (current.size === RECORD_KINDS.length) {
    return {
      maxWeightGrams: current.get('max_weight')?.valueGrams ?? null,
      estimatedOneRepMaxGrams: current.get('estimated_1rm')?.valueGrams ?? null,
      maxVolumeGrams: current.get('max_volume')?.valueGrams ?? null,
    };
  }

  const scanned = await findRecordBests(db, userId, trackedExerciseId, excludeSetId);

  return {
    maxWeightGrams: scanned.maxWeightGrams,
    estimatedOneRepMaxGrams:
      scanned.maxEpleyNumerator === null
        ? null
        : oneRepMaxFromEpleyNumerator(scanned.maxEpleyNumerator),
    maxVolumeGrams: scanned.maxVolumeGrams,
  };
}
