import type { Locale, PersonalRecord, TrackedExercise } from '@gymbuddy/shared';
import { formatRecordValueLabel } from '../../lib/format';
import { RECORD_LABELS } from '../exercises/labels';

export interface SessionRecordItemsProps {
  /** Ya con una sola marca por ejercicio y tipo (`bestPersonalRecords`). */
  readonly records: readonly PersonalRecord[];
  /** Con los archivados: una rutina puede hacer registrar uno y su marca también se nombra. */
  readonly exercises: readonly TrackedExercise[];
  readonly locale: Locale;
}

/**
 * Las filas de las marcas de la sesión, para el aviso de récord y para el resumen de «Terminar
 * sesión». Llevan el nombre del ejercicio: con una marca por ejercicio, dos «Peso máximo»
 * seguidos sin nombre volverían a parecer la misma repetida.
 */
export function SessionRecordItems({ records, exercises, locale }: SessionRecordItemsProps) {
  const names = new Map(exercises.map((exercise) => [exercise.id, exercise.name]));

  return records.map((record) => {
    const name = names.get(record.trackedExerciseId);
    const value = `${RECORD_LABELS[record.kind]}: ${formatRecordValueLabel(record, locale)}`;
    return <li key={record.id}>{name === undefined ? value : `${name} · ${value}`}</li>;
  });
}
