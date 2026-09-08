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
