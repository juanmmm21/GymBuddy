import { WEIGHT_UNITS, type ResourceId, type WeightUnit } from '@gymbuddy/shared';
import { z } from 'zod';
import type { StorageLike } from '../../lib/storage';

/**
 * En qué unidad se registra cada ejercicio, recordado en el dispositivo. Es del ejercicio y no de
 * la cuenta porque en un mismo gimnasio conviven máquinas rotuladas en libras y mancuernas en kilos:
 * lo que Juan pidió es no tener que convertir de cabeza, y eso depende de la máquina que tiene
 * delante. El peso se guarda en gramos igual; esto solo decide cómo se teclea y cómo se lee.
 */
export const WEIGHT_UNITS_STORAGE_KEY = 'gymbuddy.weight-units';

export type WeightUnitsByExercise = Readonly<Record<ResourceId, WeightUnit>>;

export const NO_WEIGHT_UNITS: WeightUnitsByExercise = {};

/** Sin nada recordado, en kilos: es como se ha registrado todo hasta ahora. */
export const DEFAULT_WEIGHT_UNIT: WeightUnit = 'kg';

const storedUnitsSchema = z.record(z.string(), z.unknown());
const weightUnitSchema = z.enum(WEIGHT_UNITS);

export function weightUnitFor(units: WeightUnitsByExercise, exerciseId: ResourceId): WeightUnit {
  return units[exerciseId] ?? DEFAULT_WEIGHT_UNIT;
}

/** Las unidades con la de un ejercicio cambiada. Los kilos no se guardan: son lo que hay sin nada. */
export function withWeightUnit(
  units: WeightUnitsByExercise,
  exerciseId: ResourceId,
  unit: WeightUnit,
): WeightUnitsByExercise {
  // Se quita la entrada en vez de guardar «kg»: así lo recordado solo crece con lo que es libras.
  const rest = Object.fromEntries(Object.entries(units).filter(([id]) => id !== exerciseId));
  return unit === DEFAULT_WEIGHT_UNIT ? rest : { ...rest, [exerciseId]: unit };
}

/**
 * Lo recordado. Una entrada que no sea una unidad válida se descarta sola, sin llevarse las demás:
 * perder la unidad de un ejercicio solo obliga a volver a pulsar «lb»; perderlas todas, a todas.
 */
export function loadWeightUnits(storage: StorageLike): WeightUnitsByExercise {
  let raw: string | null;
  try {
    raw = storage.getItem(WEIGHT_UNITS_STORAGE_KEY);
  } catch (error) {
    // Safari en modo privado lanza al leer: se registra igual, en kilos.
    console.warn('No se pudieron leer las unidades recordadas', error);
    return NO_WEIGHT_UNITS;
  }
  if (raw === null) return NO_WEIGHT_UNITS;

  let payload: unknown;
  try {
    payload = JSON.parse(raw) as unknown;
  } catch (error) {
    console.warn('Las unidades recordadas no son JSON; se usan kilos', error);
    return NO_WEIGHT_UNITS;
  }

  const parsed = storedUnitsSchema.safeParse(payload);
  if (!parsed.success) return NO_WEIGHT_UNITS;

  const units: Record<ResourceId, WeightUnit> = {};
  for (const [exerciseId, value] of Object.entries(parsed.data)) {
    const unit = weightUnitSchema.safeParse(value);
    if (unit.success) units[exerciseId] = unit.data;
  }
  return units;
}

export function saveWeightUnits(storage: StorageLike, units: WeightUnitsByExercise): void {
  try {
    storage.setItem(WEIGHT_UNITS_STORAGE_KEY, JSON.stringify(units));
  } catch (error) {
    // La unidad se aplica igual durante esta visita; solo no se recordará la próxima.
    console.warn('No se pudo recordar la unidad elegida', error);
  }
}
