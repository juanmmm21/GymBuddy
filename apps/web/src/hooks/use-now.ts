import { useSyncExternalStore } from 'react';
import { createTicker } from '../lib/ticker';

/** Un segundo: la resolución de un cronómetro de gimnasio. */
export const TICK_INTERVAL_MS = 1000;

// Uno solo para toda la app: el cronómetro de la sesión y el del descanso avanzan a la
// vez, y el intervalo se para solo cuando ninguna pantalla lo mira.
const ticker = createTicker(TICK_INTERVAL_MS);

/**
 * El instante actual, repintando una vez por segundo mientras el componente esté montado.
 */
export function useNow(): number {
  return useSyncExternalStore(ticker.subscribe, ticker.getSnapshot, ticker.getSnapshot);
}
