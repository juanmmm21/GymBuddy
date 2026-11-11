import type { PersonalRecordKind, TrackedExercise } from '@gymbuddy/shared';
import { t } from '../../i18n/index';

/** Los tres tipos de marca que guarda el Worker, tal como se leen en la ficha y en Hoy. */
export function recordLabel(kind: PersonalRecordKind): string {
  switch (kind) {
    case 'max_weight':
      return t('Peso máximo', 'Max weight');
    case 'estimated_1rm':
      return t('1RM estimado', 'Estimated 1RM');
    case 'max_volume':
      return t('Volumen', 'Volume');
  }
}

/** Orden fijo de las marcas: del dato más directo al más derivado. */
export const RECORD_ORDER: readonly PersonalRecordKind[] = [
  'max_weight',
  'estimated_1rm',
  'max_volume',
];

/** Lo que explica el interruptor «A un brazo», en la ficha y al crear un ejercicio propio. */
export function unilateralHint(): string {
  return t(
    'Una serie son los dos lados: el peso es el de un brazo y el volumen cuenta los dos.',
    'One set covers both sides: the weight is for one arm and the volume counts both.',
  );
}

export function originLabel(origin: TrackedExercise['origin']): string {
  return origin === 'catalog'
    ? t('Del catálogo', 'From the catalogue')
    : t('Ejercicio propio', 'Your own exercise');
}
