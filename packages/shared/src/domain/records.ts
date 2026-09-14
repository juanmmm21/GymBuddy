/**
 * Detección de récords personales. Se ejecuta al registrar una serie y decide, sin tocar
 * la base, cuáles de las tres marcas del ejercicio acaba de romper esa serie.
 */

import type { PersonalRecordKind } from '../schemas/record';
import { estimateOneRepMaxGrams, setVolumeGrams, type ProgressionSet } from './progression';

/** Las marcas vigentes de un ejercicio, en gramos. `null` es "todavía no hay marca". */
export interface PersonalRecordBests {
  readonly maxWeightGrams: number | null;
  readonly estimatedOneRepMaxGrams: number | null;
  readonly maxVolumeGrams: number | null;
}

export interface DetectedRecord {
  readonly kind: PersonalRecordKind;
  readonly valueGrams: number;
}

/** Un ejercicio que todavía no tiene ninguna marca. */
export const NO_PERSONAL_RECORDS: PersonalRecordBests = {
  maxWeightGrams: null,
  estimatedOneRepMaxGrams: null,
  maxVolumeGrams: null,
};

/**
 * Qué récords rompe esta serie. Se exige superar la marca de forma **estricta**: con un
 * `>=`, repetir el mismo peso semana tras semana celebraría un récord cada vez y la
 * celebración dejaría de significar nada.
 *
 * El calentamiento no cuenta, y una serie sin peso tampoco: en un ejercicio de peso
 * corporal las tres magnitudes valen cero y no distinguen una serie de otra. Ahí el
 * progreso son repeticiones, que es otra cosa y no es lo que mide esta tabla.
 */
export function detectPersonalRecords(
  set: ProgressionSet,
  bests: PersonalRecordBests,
): DetectedRecord[] {
  if (set.isWarmup || set.weightGrams <= 0) return [];

  const candidates: readonly DetectedRecord[] = [
    { kind: 'max_weight', valueGrams: set.weightGrams },
    {
      kind: 'estimated_1rm',
      valueGrams: estimateOneRepMaxGrams(set.weightGrams, set.reps),
    },
    { kind: 'max_volume', valueGrams: setVolumeGrams(set) },
  ];

  return candidates.filter((candidate) => beatsPrevious(candidate, bests));
}

/** Una serie del historial de un ejercicio, tal y como la recorre la reconstrucción de marcas. */
export interface RecordReplaySet extends ProgressionSet {
  readonly id: string;
  readonly orderIndex: number;
}

/** Una marca que la reconstrucción vuelve a escribir, atada a la serie que la puso. */
export interface ReplayedRecord extends DetectedRecord {
  readonly setId: string;
  readonly achievedAt: string;
}

export interface RecordReplayOptions {
  /** Desde qué instante se reescriben las marcas; lo anterior no depende de lo borrado. */
  readonly from: string;
  /** Las marcas guardadas antes de `from`, que se conservan y también cuentan como listón. */
  readonly kept: PersonalRecordBests;
}

/**
 * Las marcas que tienen que existir desde `from` tras borrar series de un ejercicio. Una marca
 * solo depende de lo que se levantó **antes**, así que las anteriores al borrado siguen siendo
 * ciertas; las posteriores no: si se borra la serie que tenía el récord, la siguiente mejor que
 * vino detrás lo es y nadie se lo había dicho.
 *
 * El listón al llegar a `from` es lo más alto entre lo que dan las series anteriores y las marcas
 * que se conservan: una marca copiada de una importación, o anterior a la tabla, puede no salir
 * de las series, y sin contarla se coronaría una serie peor que ella.
 */
export function replayPersonalRecords(
  sets: readonly RecordReplaySet[],
  { from, kept }: RecordReplayOptions,
): ReplayedRecord[] {
  const fromMs = parseInstant(from);
  const ordered = [...sets].sort(compareReplaySets);
  const records: ReplayedRecord[] = [];
  let bests = NO_PERSONAL_RECORDS;
  let reachedFrom = false;

  for (const set of ordered) {
    const rewritten = parseInstant(set.completedAt) >= fromMs;
    if (rewritten && !reachedFrom) {
      bests = higherBests(bests, kept);
      reachedFrom = true;
    }

    const detected = detectPersonalRecords(set, bests);
    if (rewritten) {
      records.push(
        ...detected.map((record) => ({ ...record, setId: set.id, achievedAt: set.completedAt })),
      );
    }
    bests = raiseBests(bests, detected);
  }

  return records;
}

/**
 * El orden en que se levantaron: el instante y, dentro del mismo instante, la posición en la
 * sesión y el id, para que dos series gemelas den siempre el mismo resultado. Se comparan
 * instantes y no texto porque el contrato admite desfase horario.
 */
function compareReplaySets(left: RecordReplaySet, right: RecordReplaySet): number {
  const byInstant = parseInstant(left.completedAt) - parseInstant(right.completedAt);
  if (byInstant !== 0) return byInstant;
  if (left.orderIndex !== right.orderIndex) return left.orderIndex - right.orderIndex;
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

function parseInstant(value: string): number {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new RangeError(`Instante ilegible al reconstruir marcas: "${value}"`);
  return ms;
}

function raiseBests(
  bests: PersonalRecordBests,
  detected: readonly DetectedRecord[],
): PersonalRecordBests {
  let raised = bests;
  for (const record of detected) {
    switch (record.kind) {
      case 'max_weight':
        raised = { ...raised, maxWeightGrams: record.valueGrams };
        break;
      case 'estimated_1rm':
        raised = { ...raised, estimatedOneRepMaxGrams: record.valueGrams };
        break;
      case 'max_volume':
        raised = { ...raised, maxVolumeGrams: record.valueGrams };
        break;
    }
  }
  return raised;
}

function higherBests(left: PersonalRecordBests, right: PersonalRecordBests): PersonalRecordBests {
  return {
    maxWeightGrams: higher(left.maxWeightGrams, right.maxWeightGrams),
    estimatedOneRepMaxGrams: higher(left.estimatedOneRepMaxGrams, right.estimatedOneRepMaxGrams),
    maxVolumeGrams: higher(left.maxVolumeGrams, right.maxVolumeGrams),
  };
}

function higher(left: number | null, right: number | null): number | null {
  if (left === null) return right;
  if (right === null) return left;
  return Math.max(left, right);
}

function beatsPrevious(candidate: DetectedRecord, bests: PersonalRecordBests): boolean {
  const previous = previousBest(candidate.kind, bests);

  return previous === null || candidate.valueGrams > previous;
}

function previousBest(kind: PersonalRecordKind, bests: PersonalRecordBests): number | null {
  switch (kind) {
    case 'max_weight':
      return bests.maxWeightGrams;
    case 'estimated_1rm':
      return bests.estimatedOneRepMaxGrams;
    case 'max_volume':
      return bests.maxVolumeGrams;
  }
}
