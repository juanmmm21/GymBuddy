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

/**
 * Cuánto tiempo, desde que empezó, un cardio en marcha cuenta como actividad (revisión del ADR 0008).
 * Mientras se hace no se apunta nada, y media hora de cinta tras esperar a un amigo cerraba la
 * sesión antes de poder apuntarla. Tres horas cubren una ruta larga en bici; más ya es un cardio
 * que se olvidó parar, y la sesión vuelve a cerrarse sola como cualquier otra.
 */
export const CARDIO_IN_PROGRESS_LIMIT_MINUTES = 180;

export const CARDIO_IN_PROGRESS_LIMIT_MS =
  CARDIO_IN_PROGRESS_LIMIT_MINUTES * MILLISECONDS_PER_MINUTE;

/** Lo que hace falta de una sesión para saber si sigue viva. */
export interface SessionActivity {
  readonly startedAt: string;
  /** Hora de cada serie de la sesión, en cualquier orden. */
  readonly setCompletedAts: readonly string[];
  /** Cuándo empezó el cardio que sigue en marcha; nulo o ausente si no hay ninguno. */
  readonly cardioStartedAt?: string | null | undefined;
}

/**
 * La última actividad de la sesión: lo más reciente entre su comienzo, sus series y el comienzo del
 * cardio en marcha. Una hora que no se puede leer no cuenta; el contrato ya las valida al entrar,
 * así que es solo defensa.
 */
export function lastSessionActivityAt(activity: SessionActivity): string {
  let latest = activity.startedAt;
  let latestInstant = Date.parse(activity.startedAt);
  const moments =
    activity.cardioStartedAt === null || activity.cardioStartedAt === undefined
      ? activity.setCompletedAts
      : [...activity.setCompletedAts, activity.cardioStartedAt];

  for (const completedAt of moments) {
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
 * Si el cardio que empezó a esa hora sigue contando como actividad. Uno que empezó «en el futuro»
 * —un reloj de móvil adelantado— también cuenta: es un cardio en marcha, no uno olvidado.
 */
export function cardioKeepsSessionAlive(
  cardioStartedAt: string | null | undefined,
  now: Date,
): boolean {
  if (cardioStartedAt === null || cardioStartedAt === undefined) return false;
  const startedInstant = Date.parse(cardioStartedAt);
  if (Number.isNaN(startedInstant)) return false;

  return now.getTime() - startedInstant < CARDIO_IN_PROGRESS_LIMIT_MS;
}

/**
 * La hora a la que se cierra sola una sesión abierta, o `null` si sigue viva. **Es la de su
 * última actividad, no la de ahora**: los minutos de espera no cuentan como entrenamiento,
 * así que la duración queda como si se hubiese pulsado «Terminar» tras la última serie.
 * Con un cardio en marcha no se cierra hasta que pase su propio tope.
 */
export function idleSessionEndAt(activity: SessionActivity, now: Date): string | null {
  if (cardioKeepsSessionAlive(activity.cardioStartedAt, now)) return null;

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

/**
 * Cuándo empezó una serie de cardio: su hora es la de **terminarla**, así que empezó `durationSeconds`
 * antes. Es la hora con la que una serie de cardio de la cola decide si continúa una sesión que se
 * cerró sola: media hora de cinta apuntada al bajarse empezó dentro del margen aunque se apunte fuera.
 */
export function cardioSetStartedAt(completedAt: string, durationSeconds: number): string {
  const completedInstant = Date.parse(completedAt);
  if (Number.isNaN(completedInstant)) return completedAt;

  return new Date(completedInstant - durationSeconds * 1000).toISOString();
}

/**
 * Si una serie de cardio que terminó a `completedAt` es la del cardio en marcha, y por tanto lo
 * apaga. Una que terminó antes de que ese cardio empezara es otra —una vieja que llega tarde de la
 * cola— y no puede dar por acabado el que sigue corriendo.
 */
export function endsCardioInProgress(cardioStartedAt: string, completedAt: string): boolean {
  const startedInstant = Date.parse(cardioStartedAt);
  const completedInstant = Date.parse(completedAt);
  if (Number.isNaN(startedInstant) || Number.isNaN(completedInstant)) return true;

  return completedInstant >= startedInstant;
}
