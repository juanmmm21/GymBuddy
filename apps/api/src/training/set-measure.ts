import type { SetEntryRow } from '../db/schema';

/** Lo que mide una serie guardada, con las columnas de su tipo ya comprobadas. */
export type SetMeasure =
  | { readonly kind: 'strength'; readonly weightGrams: number; readonly reps: number }
  | {
      readonly kind: 'cardio';
      readonly durationSeconds: number;
      readonly distanceMeters: number | null;
    };

/** Las columnas de `set_entry` que dependen del tipo, tal y como se escriben. */
export type SetMeasureColumns = Pick<
  SetEntryRow,
  'kind' | 'weightGrams' | 'reps' | 'durationSeconds' | 'distanceMeters'
>;

/**
 * Lee la medida de una fila. El CHECK `set_entry_kind_shape` impide que falten las columnas de su
 * tipo, así que si faltan la base está dañada: se lanza en vez de inventar un peso o un tiempo.
 */
export function setMeasureOf(row: SetMeasureColumns & Pick<SetEntryRow, 'id'>): SetMeasure {
  if (row.kind === 'strength') {
    if (row.weightGrams === null || row.reps === null) {
      throw new Error(`La serie de fuerza ${row.id} no tiene peso o repeticiones`);
    }
    return { kind: 'strength', weightGrams: row.weightGrams, reps: row.reps };
  }

  if (row.durationSeconds === null) {
    throw new Error(`La serie de cardio ${row.id} no tiene duración`);
  }
  return {
    kind: 'cardio',
    durationSeconds: row.durationSeconds,
    distanceMeters: row.distanceMeters,
  };
}

/** Las columnas que escribe una medida: las del otro tipo van a nulo, como pide el CHECK. */
export function setMeasureColumns(measure: SetMeasure): SetMeasureColumns {
  return measure.kind === 'strength'
    ? {
        kind: 'strength',
        weightGrams: measure.weightGrams,
        reps: measure.reps,
        durationSeconds: null,
        distanceMeters: null,
      }
    : {
        kind: 'cardio',
        weightGrams: null,
        reps: null,
        durationSeconds: measure.durationSeconds,
        distanceMeters: measure.distanceMeters,
      };
}
