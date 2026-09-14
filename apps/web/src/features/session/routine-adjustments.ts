import {
  MAX_ROUTINE_TARGET_SETS,
  resourceIdSchema,
  type ResourceId,
  type RoutineItem,
} from '@gymbuddy/shared';
import { z } from 'zod';

/**
 * Lo que se cambia de una línea de la rutina solo para la sesión en curso: otro ejercicio (la
 * máquina que pide la rutina no está) u otro número de series (hoy tocan cuatro y no tres). La
 * rutina guardada en el Worker no se entera; esto vive en el dispositivo junto a la rutina que
 * guía la sesión y se olvida con ella.
 *
 * Cada campo es `null` cuando esa parte sigue siendo la de la rutina: así una línea que se deja
 * como estaba no arrastra un ajuste vacío.
 */
export const routineLineAdjustmentSchema = z.object({
  itemId: resourceIdSchema,
  trackedExerciseId: resourceIdSchema.nullable(),
  targetSets: z.int().min(1).max(MAX_ROUTINE_TARGET_SETS).nullable(),
});

export type RoutineLineAdjustment = z.infer<typeof routineLineAdjustmentSchema>;

export const NO_ADJUSTMENTS: readonly RoutineLineAdjustment[] = [];

/** Lo que se elige en la hoja: siempre los dos valores, se parezcan o no a los de la rutina. */
export interface LineChoice {
  readonly trackedExerciseId: ResourceId;
  readonly targetSets: number;
}

/** Una línea tal y como se entrena hoy, con lo que cambió respecto a la rutina. */
export interface AdjustedRoutineItem {
  /** La línea con el ejercicio y las series de hoy; su `id` y su orden son los de la rutina. */
  readonly item: RoutineItem;
  /** La línea tal y como está guardada en la rutina. */
  readonly planned: RoutineItem;
  /** Si la línea difiere en algo de la rutina guardada. */
  readonly adjusted: boolean;
}

/**
 * Aplica los ajustes a las líneas de la rutina. Un ajuste de una línea que ya no existe —la
 * rutina se editó desde otro móvil a mitad de sesión— se ignora sin más.
 */
export function adjustRoutineItems(
  items: readonly RoutineItem[],
  adjustments: readonly RoutineLineAdjustment[],
): AdjustedRoutineItem[] {
  const byItem = new Map(adjustments.map((adjustment) => [adjustment.itemId, adjustment]));

  return items.map((item) => {
    const adjustment = byItem.get(item.id);
    const trackedExerciseId = adjustment?.trackedExerciseId ?? item.trackedExerciseId;
    const targetSets = adjustment?.targetSets ?? item.targetSets;

    return {
      item: { ...item, trackedExerciseId, targetSets },
      planned: item,
      adjusted: trackedExerciseId !== item.trackedExerciseId || targetSets !== item.targetSets,
    };
  });
}

/**
 * Los ajustes tras elegir `choice` para `item`. Se comparan con la rutina y no con el ajuste
 * anterior: volver a elegir lo que la rutina decía quita el ajuste en vez de guardar uno igual.
 */
export function withLineChoice(
  adjustments: readonly RoutineLineAdjustment[],
  item: RoutineItem,
  choice: LineChoice,
): RoutineLineAdjustment[] {
  const others = adjustments.filter((adjustment) => adjustment.itemId !== item.id);
  const trackedExerciseId =
    choice.trackedExerciseId === item.trackedExerciseId ? null : choice.trackedExerciseId;
  const targetSets = choice.targetSets === item.targetSets ? null : choice.targetSets;

  if (trackedExerciseId === null && targetSets === null) return others;
  return [...others, { itemId: item.id, trackedExerciseId, targetSets }];
}

/** Los ajustes sin los de esa línea: vuelve a entrenarse como dice la rutina. */
export function withoutLineAdjustment(
  adjustments: readonly RoutineLineAdjustment[],
  itemId: ResourceId,
): RoutineLineAdjustment[] {
  return adjustments.filter((adjustment) => adjustment.itemId !== itemId);
}
