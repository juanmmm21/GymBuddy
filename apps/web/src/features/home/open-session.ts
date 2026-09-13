import type { TrainingSignals } from '@gymbuddy/shared';
import type { SessionWithPendingWrites } from '../../offline/overlay';

/** Lo que Hoy ofrece arriba: seguir la sesión abierta o empezar una. */
export type HomeSessionState =
  { readonly kind: 'none' } | { readonly kind: 'open'; readonly startedAt: string };

/**
 * Si hay una sesión abierta según quien entrena, no según el Worker. La sesión con la cola
 * encima manda: una abierta sin cobertura todavía no existe para las señales, y una cerrada sin
 * cobertura sigue abierta para ellas; con las señales solas, Hoy ofrecería empezar otra sesión
 * encima de la que se está haciendo, o seguir una que ya se terminó.
 *
 * Sin esa lectura —todavía cargando, o sin red y sin nada guardado— queda lo que dicen las
 * señales. Con una sola sesión abierta a la vez, la última que empezó es la abierta.
 */
export function homeSessionState(
  signals: TrainingSignals,
  open: SessionWithPendingWrites | undefined,
): HomeSessionState {
  if (open !== undefined) {
    return open.session === null
      ? { kind: 'none' }
      : { kind: 'open', startedAt: open.session.startedAt };
  }

  const { activeSessionId, lastSessionAt } = signals;
  return activeSessionId === null || lastSessionAt === null
    ? { kind: 'none' }
    : { kind: 'open', startedAt: lastSessionAt };
}
