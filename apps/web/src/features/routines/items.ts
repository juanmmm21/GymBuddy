import {
  routineItemInputSchema,
  type ResourceId,
  type RoutineItem,
  type RoutineItemInput,
} from '@gymbuddy/shared';
import { pluralize } from '../../lib/format';

/*
 * Las operaciones del editor sobre la lista de ejercicios de una rutina. Todas devuelven
 * la lista entera tal y como tiene que viajar en el `PATCH`: el Worker reemplaza `items`
 * de una vez y el orden es la posición, así que no hay nada más que calcular en pantalla.
 */

/**
 * Lo que propone una línea nueva. Es un punto de partida que se cambia con dos toques, no
 * una recomendación: el rango es el que más se ve escrito en una hoja de gimnasio.
 */
export const DEFAULT_TARGET_SETS = 3;
export const DEFAULT_TARGET_REPS_MIN = 8;
export const DEFAULT_TARGET_REPS_MAX = 12;

export type MoveDirection = 'up' | 'down';

/**
 * Las líneas de una rutina guardada, listas para mandarse de vuelta. Se ordenan por
 * `orderIndex` aunque el Worker ya las devuelva así: en la petición el orden es la
 * posición, y mandarlas desordenadas reordenaría la rutina sin que nadie lo pidiera.
 */
export function toItemInputs(items: readonly RoutineItem[]): RoutineItemInput[] {
  return [...items]
    .sort((left, right) => left.orderIndex - right.orderIndex)
    .map((item) => ({
      id: item.id,
      trackedExerciseId: item.trackedExerciseId,
      targetSets: item.targetSets,
      targetRepsMin: item.targetRepsMin,
      targetRepsMax: item.targetRepsMax,
    }));
}

/** Sube o baja una línea un puesto. `null` si ya está en el borde: no hay nada que mandar. */
export function moveItem(
  items: readonly RoutineItemInput[],
  index: number,
  direction: MoveDirection,
): RoutineItemInput[] | null {
  const target = direction === 'up' ? index - 1 : index + 1;
  const moving = items[index];
  const displaced = items[target];
  if (moving === undefined || displaced === undefined) return null;

  const next = [...items];
  next[index] = displaced;
  next[target] = moving;
  return next;
}

/**
 * Añade una línea al final o sustituye la que tiene su mismo identificador, sin moverla
 * de sitio. Por eso la edición conserva el `id` de la línea: con uno nuevo, reenviar la
 * misma corrección desde la cola offline se leería como otra línea distinta.
 */
export function upsertItem(
  items: readonly RoutineItemInput[],
  item: RoutineItemInput,
): RoutineItemInput[] {
  const position = items.findIndex((candidate) => candidate.id === item.id);
  if (position === -1) return [...items, item];

  return items.map((candidate, index) => (index === position ? item : candidate));
}

export function removeItem(
  items: readonly RoutineItemInput[],
  itemId: ResourceId,
): RoutineItemInput[] {
  return items.filter((item) => item.id !== itemId);
}

/** Lo que un formulario tiene de una línea mientras se edita: los números pueden estar vacíos. */
export interface ItemValues {
  readonly id: ResourceId;
  readonly trackedExerciseId: ResourceId;
  readonly targetSets: number | null;
  readonly targetRepsMin: number | null;
  readonly targetRepsMax: number | null;
}

/**
 * La línea que se puede mandar, o `null` si el formulario todavía no lo permite. Decide el
 * esquema del contrato —topes y rango invertido incluidos— y no una copia de sus reglas.
 */
export function toItemInput(values: ItemValues): RoutineItemInput | null {
  const parsed = routineItemInputSchema.safeParse(values);
  return parsed.success ? parsed.data : null;
}

/** El único error de un formulario completo que merece explicarse: el rango al revés. */
export function hasInvertedRange(values: ItemValues): boolean {
  return (
    values.targetRepsMin !== null &&
    values.targetRepsMax !== null &&
    values.targetRepsMax < values.targetRepsMin
  );
}

/** "8–12 reps", o "8 reps" cuando el rango es un número fijo. */
export function formatRepsRange(min: number, max: number): string {
  return min === max ? pluralize(min, 'rep', 'reps') : `${String(min)}–${String(max)} reps`;
}

/** "3 series × 8–12 reps": el objetivo de una línea tal como se lee en una hoja de rutina. */
export function formatTarget(
  item: Pick<RoutineItemInput, 'targetSets' | 'targetRepsMin' | 'targetRepsMax'>,
): string {
  return `${pluralize(item.targetSets, 'serie', 'series')} × ${formatRepsRange(item.targetRepsMin, item.targetRepsMax)}`;
}

/**
 * "4 ejercicios · 14 series". Los ejercicios se cuentan distintos: el mismo en dos bloques
 * sigue siendo un ejercicio, aunque sus series sumen las de los dos.
 */
export function describeRoutineSize(
  items: readonly Pick<RoutineItemInput, 'trackedExerciseId' | 'targetSets'>[],
): string {
  if (items.length === 0) return 'Sin ejercicios';

  const exercises = new Set(items.map((item) => item.trackedExerciseId)).size;
  const sets = items.reduce((total, item) => total + item.targetSets, 0);
  return `${pluralize(exercises, 'ejercicio', 'ejercicios')} · ${pluralize(sets, 'serie', 'series')}`;
}
