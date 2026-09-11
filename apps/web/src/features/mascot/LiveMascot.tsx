import { mascotState, type Locale, type MascotDeviceSignals } from '@gymbuddy/shared';
import { useTrackedExercises } from '../../api/queries';
import { useNow } from '../../hooks/use-now';
import { Mascot } from './Mascot';
import { mascotMessage, stalledMentions } from './messages';
import type { LiveMascotSignals } from './mascot-signals';

export interface LiveMascotProps {
  readonly signals: LiveMascotSignals;
  readonly device: MascotDeviceSignals;
  readonly locale: Locale;
}

/**
 * La mascota con reloj. El instante se lee aquí y no en la pantalla: `useNow` repinta
 * una vez por segundo, y así lo que se repinta es la tarjeta, no Hoy entero ni la sesión.
 */
export function LiveMascot({ signals, device, locale }: LiveMascotProps) {
  const now = new Date(useNow());
  const state = mascotState(signals, device, now);
  const stalledIds =
    state.mood === 'nudging' && state.reason === 'stagnation' ? state.stalledExerciseIds : [];

  // Los nombres solo hacen falta para nombrar un estancado. Con los archivados, la misma
  // clave que la ficha del ejercicio: si ya está en caché, no se pide nada.
  const exercises = useTrackedExercises(
    { includeArchived: true },
    { enabled: stalledIds.length > 0 },
  );
  const stalled = stalledMentions(stalledIds, signals.stalled, exercises.data ?? []);

  return <Mascot state={state} message={mascotMessage(state, { locale, now, stalled })} />;
}
