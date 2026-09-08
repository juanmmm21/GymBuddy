import {
  detectPersonalRecords,
  formatGramsAsVolumeKilograms,
  oneRepMaxFromEpleyNumerator,
  type PersonalRecord,
  type PersonalRecordBests,
  type PersonalRecordKind,
  type ProgressionSet,
} from '@gymbuddy/shared';
import type { Database } from '../db/client';
import { findRecordBests, listRecordsForExercise } from '../db/queries';
import { personalRecord, type PersonalRecordRow, type SetEntryRow } from '../db/schema';

/** Los tres tipos de marca. Estar los tres es lo que hace fiable la tabla como caché. */
const RECORD_KINDS: readonly PersonalRecordKind[] = ['max_weight', 'estimated_1rm', 'max_volume'];

/**
 * Guarda los récords que rompe una serie recién registrada y devuelve los que ha roto,
 * para que la PWA los celebre en el momento en vez de descubrirlos al abrir la pantalla.
 *
 * Se ejecuta también cuando la serie ya existía: si el primer intento insertó la serie y
 * se cayó antes de escribir la marca, el reenvío de la cola offline lo arregla solo. Que
 * no duplique nada lo garantiza la comparación estricta contra las marcas ya guardadas.
 */
export async function applyPersonalRecords(
  db: Database,
  userId: string,
  row: SetEntryRow,
): Promise<PersonalRecord[]> {
  const set: ProgressionSet = {
    weightGrams: row.weightGrams,
    reps: row.reps,
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
