/**
 * Cuándo una sesión abierta se da por terminada sola (ADR 0008). La gente se va del gimnasio sin
 * pulsar «Terminar», y una sesión abierta hasta el día siguiente estropea la duración, el
 * calendario y el botón de empezar. La regla es la misma en el Worker y en la PWA: si no, el
 * móvil sin cobertura seguiría en una sesión que el Worker ya dio por cerrada, y la serie que se
 * apuntase ahí se perdería al llegar.
 *
 * Las fechas se comparan como instantes y no como texto: el contrato admite desfase horario y en
 * ese caso el orden lexicográfico ya no coincide con el cronológico.
 */

const MILLISECONDS_PER_MINUTE = 60_000;

/**
 * Minutos sin actividad tras los que la sesión se cierra. Empezó en veinte (lo eligió Juan), pero
 * cortaba entrenamientos de verdad: esperar a un amigo antes del cardio, o el propio cardio, que
 * no registra series mientras dura. Con sesenta ya no corta a nadie que siga en el gimnasio y
 * tampoco deja una sesión abierta la tarde entera. Lo decidió Juan el 2026-09-15.
 */
export const SESSION_IDLE_LIMIT_MINUTES = 60;

export const SESSION_IDLE_LIMIT_MS = SESSION_IDLE_LIMIT_MINUTES * MILLISECONDS_PER_MINUTE;

/** Lo que hace falta de una sesión para saber si sigue viva. */
export interface SessionActivity {
  readonly startedAt: string;
  /** Hora de cada serie de la sesión, en cualquier orden. */
  readonly setCompletedAts: readonly string[];
}

/**
 * La última actividad de la sesión: la serie más reciente o, sin series, su comienzo. Una hora que
 * no se puede leer no cuenta; el contrato ya las valida al entrar, así que es solo defensa.
 */
export function lastSessionActivityAt(activity: SessionActivity): string {
  let latest = activity.startedAt;
  let latestInstant = Date.parse(activity.startedAt);

  for (const completedAt of activity.setCompletedAts) {
    const instant = Date.parse(completedAt);
    if (Number.isNaN(instant)) continue;
    if (Number.isNaN(latestInstant) || instant > latestInstant) {
      latest = completedAt;
      latestInstant = instant;
    }
  }

  return latest;
}

/**
 * La hora a la que se cierra sola una sesión abierta, o `null` si sigue viva. **Es la de su
 * última actividad, no la de ahora**: los minutos de espera no cuentan como entrenamiento,
 * así que la duración queda como si se hubiese pulsado «Terminar» tras la última serie.
 */
export function idleSessionEndAt(activity: SessionActivity, now: Date): string | null {
  const last = lastSessionActivityAt(activity);
  const lastInstant = Date.parse(last);
  if (Number.isNaN(lastInstant)) return null;

  return now.getTime() - lastInstant >= SESSION_IDLE_LIMIT_MS ? last : null;
}

/**
 * Si algo que pasó a la hora `at` continúa una sesión que se cerró sola a `endedAt`. Es lo que
 * llega de la cola offline: series apuntadas sin cobertura mientras el Worker, sin noticias,
 * daba la sesión por terminada. Si la serie cae dentro del margen, la sesión no estaba
 * abandonada y se reabre; si cae después, ya era otro entrenamiento.
 */
export function continuesIdleSession(endedAt: string, at: string): boolean {
  const endedInstant = Date.parse(endedAt);
  const atInstant = Date.parse(at);
  if (Number.isNaN(endedInstant) || Number.isNaN(atInstant)) return false;

  return atInstant - endedInstant < SESSION_IDLE_LIMIT_MS;
}
