import { useState } from 'react';
import { useStorage } from '../../app/StorageProvider';
import { loadWeightUnits, type WeightUnitsByExercise } from './weight-unit-store';

/**
 * Las unidades recordadas, para las pantallas que solo leen pesos. Se leen una vez al montar, sin
 * suscribirse: la unidad solo cambia desde la hoja de registro de la sesión, y cualquier otra
 * pantalla se vuelve a montar al navegar a ella, así que ya la ve.
 */
export function useWeightUnits(): WeightUnitsByExercise {
  const storage = useStorage();
  const [units] = useState(() => loadWeightUnits(storage));
  return units;
}
