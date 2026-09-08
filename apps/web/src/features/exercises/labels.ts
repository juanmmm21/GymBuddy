import type { PersonalRecordKind, TrackedExercise } from '@gymbuddy/shared';

/** Los tres tipos de marca que guarda el Worker, tal como se leen en la ficha y en Hoy. */
export const RECORD_LABELS: Readonly<Record<PersonalRecordKind, string>> = {
  max_weight: 'Peso máximo',
  estimated_1rm: '1RM estimado',
  max_volume: 'Volumen',
};

/** Orden fijo de las marcas: del dato más directo al más derivado. */
export const RECORD_ORDER: readonly PersonalRecordKind[] = [
  'max_weight',
  'estimated_1rm',
  'max_volume',
];

export const ORIGIN_LABELS: Readonly<Record<TrackedExercise['origin'], string>> = {
  catalog: 'Del catálogo',
  custom: 'Ejercicio propio',
};
