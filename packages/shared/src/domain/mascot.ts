/**
 * La mascota: qué cara pone según cómo va el entrenamiento. Es lógica y no decoración
 * (`AGENTS.md` §5): el estado sale de aquí, puro y con tests, y el componente de la PWA
 * —o el bot— solo lo dibuja o lo escribe. Si una pantalla decide por su cuenta que la
 * mascota se duerme, hay dos máquinas de estados y acabarán diciendo cosas distintas.
 *
 * El instante entra por parámetro: sin `Date.now()` dentro, el mismo estado sale en el
 * Worker, en el navegador y en un test, y el componente decide cuándo repintar.
 */

import { daysSinceLastSession } from './signals';

const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_HOUR = 3600;

/**
 * Lo que dura la celebración de una marca. Es el rato de dejar la barra y mirar el móvil:
 * más largo taparía el descanso que viene detrás, que es lo que la mascota tiene que
 * enseñar entre serie y serie.
 */
export const CELEBRATION_WINDOW_SECONDS = 60;

/**
 * Días completos sin entrenar a partir de los cuales la mascota empuja. Con cuatro no
 * salta en el hueco normal de quien entrena lunes y jueves, pero sí cuando se ha saltado
 * un día que tocaba.
 */
export const NUDGE_AFTER_DAYS = 4;

/** Una semana entera sin aparecer: la mascota se ha dormido esperando. */
export const SLEEPY_AFTER_DAYS = 7;

/**
 * Horas sin actividad a partir de las cuales una sesión abierta ya no es «estar en el
 * gimnasio», sino una sesión que se quedó sin cerrar. Una sesión real no pasa de tres
 * horas; con el doble de margen, una tarde larga no salta, y una sesión de la mañana que
 * sigue abierta por la noche ya es otro entrenamiento.
 */
export const STALE_SESSION_HOURS = 6;

/** Los seis estados. El orden en el que se resuelven cuando coinciden está en `RULES`. */
export const MASCOT_MOODS = [
  'celebrating',
  'resting',
  'cheering',
  'sleepy',
  'nudging',
  'idle',
] as const;

export type MascotMood = (typeof MASCOT_MOODS)[number];

/**
 * Lo que sabe el Worker. Es un subconjunto estructural de `TrainingSignals`, así que la
 * respuesta de `GET /stats/signals` se pasa tal cual; declararlo estrecho deja que el bot
 * lo construya sin inventarse los campos que la mascota no lee.
 */
export interface MascotTrainingSignals {
  readonly lastSessionAt: string | null;
  readonly activeSessionId: string | null;
  readonly latestRecord: { readonly achievedAt: string } | null;
  readonly stalled: readonly { readonly trackedExerciseId: string }[];
}

/**
 * Lo que solo sabe el dispositivo: el descanso en curso y las marcas que acaba de devolver
 * el registro de una serie, antes de que las señales del Worker se vuelvan a pedir.
 */
export interface MascotDeviceSignals {
  /**
   * El descanso de la sesión abierta: empieza en el `completedAt` de su última serie, igual
   * que el temporizador de la pantalla. `null` sin sesión o sin ninguna serie todavía.
   */
  readonly rest: { readonly lastSetAt: string; readonly targetSeconds: number } | null;
  readonly freshRecords: readonly { readonly achievedAt: string }[];
}

/** Un dispositivo que no aporta nada: la pantalla de Hoy o el bot. */
export const NO_DEVICE_SIGNALS: MascotDeviceSignals = { rest: null, freshRecords: [] };

/**
 * El estado resuelto, con el motivo que lo produjo. El motivo viaja con él para que los
 * mensajes no tengan que volver a deducirlo: «llevas cinco días sin venir» y «toca subir
 * peso» son los dos `nudging`, y distinguirlos en el componente sería repetir esta lógica.
 */
export type MascotState =
  | { readonly mood: 'celebrating'; readonly recordAchievedAt: string }
  | { readonly mood: 'resting'; readonly remainingSeconds: number }
  | { readonly mood: 'cheering'; readonly reason: 'session_started' | 'rest_over' }
  | { readonly mood: 'sleepy'; readonly daysSinceLastSession: number }
  | {
      readonly mood: 'nudging';
      readonly reason: 'forgotten_session';
      /** Cuándo se abrió la sesión que sigue sin cerrar. */
      readonly openedAt: string;
    }
  | {
      readonly mood: 'nudging';
      readonly reason: 'absence';
      readonly daysSinceLastSession: number;
    }
  | {
      readonly mood: 'nudging';
      readonly reason: 'stagnation';
      readonly stalledExerciseIds: readonly string[];
    }
  | { readonly mood: 'idle'; readonly reason: 'never_trained' | 'on_track' };

interface MascotContext {
  readonly signals: MascotTrainingSignals;
  readonly device: MascotDeviceSignals;
  readonly now: Date;
}

type MascotRule = (context: MascotContext) => MascotState | null;

/**
 * La celebración: una marca de hace menos de `CELEBRATION_WINDOW_SECONDS`, venga del Worker
 * o de la respuesta que la pantalla acaba de recibir. Una marca con fecha algo futura (el
 * reloj del móvil adelantado) está recién batida; una fecha ilegible no se celebra.
 */
const celebrating: MascotRule = ({ signals, device, now }) => {
  const candidates = [
    ...(signals.latestRecord === null ? [] : [signals.latestRecord]),
    ...device.freshRecords,
  ];

  let freshest: { readonly achievedAt: string; readonly timestamp: number } | null = null;
  for (const record of candidates) {
    const timestamp = Date.parse(record.achievedAt);
    if (Number.isNaN(timestamp)) continue;
    if (now.getTime() - timestamp >= CELEBRATION_WINDOW_SECONDS * MILLISECONDS_PER_SECOND) continue;
    if (freshest === null || timestamp > freshest.timestamp) {
      freshest = { achievedAt: record.achievedAt, timestamp };
    }
  }

  return freshest === null ? null : { mood: 'celebrating', recordAchievedAt: freshest.achievedAt };
};

/**
 * El descanso cuenta en segundos completos, igual que el temporizador de la sesión: si la
 * mascota contara en milisegundos, habría un instante en el que ella ya se ha levantado y
 * el reloj de al lado todavía no ha llegado a cero.
 *
 * Solo vale con una sesión abierta según el Worker: las señales se invalidan con cada
 * escritura de entrenamiento, así que mandan sobre una pantalla que aún no se ha enterado
 * de que la sesión se cerró.
 */
const resting: MascotRule = ({ signals, device, now }) => {
  if (signals.activeSessionId === null || device.rest === null) return null;

  const restStart = Date.parse(device.rest.lastSetAt);
  if (Number.isNaN(restStart)) return null;

  const elapsedSeconds = Math.max(
    0,
    Math.floor((now.getTime() - restStart) / MILLISECONDS_PER_SECOND),
  );
  const remainingSeconds = device.rest.targetSeconds - elapsedSeconds;

  return remainingSeconds > 0 ? { mood: 'resting', remainingSeconds } : null;
};

/**
 * Una sesión abierta que lleva `STALE_SESSION_HOURS` sin moverse. La actividad es lo último
 * que se sabe de ella: su comienzo —con una sola sesión abierta a la vez, `lastSessionAt` es
 * el de la abierta— o la última serie, si la pantalla la conoce. Sin ninguna fecha legible
 * no se puede decir que esté olvidada, y se sigue tratando como abierta.
 *
 * El Worker no la cierra solo a propósito: una hora de cierre inventada sería un dato falso
 * en el historial, y la cola offline podría llegar después con series para ella.
 */
function isStaleOpenSession({ signals, device, now }: MascotContext): boolean {
  if (signals.activeSessionId === null) return false;

  const activity = [signals.lastSessionAt, device.rest?.lastSetAt ?? null]
    .map((iso) => (iso === null ? Number.NaN : Date.parse(iso)))
    .filter((timestamp) => !Number.isNaN(timestamp));
  if (activity.length === 0) return false;

  const idleMilliseconds = now.getTime() - Math.max(...activity);
  return idleMilliseconds >= STALE_SESSION_HOURS * SECONDS_PER_HOUR * MILLISECONDS_PER_SECOND;
}

/** En el gimnasio y sin descansar: la primera serie o la siguiente, toca animar. */
const cheering: MascotRule = (context) => {
  const { signals, device } = context;
  if (signals.activeSessionId === null || isStaleOpenSession(context)) return null;

  return { mood: 'cheering', reason: device.rest === null ? 'session_started' : 'rest_over' };
};

/**
 * La sesión que se quedó abierta. Va antes que el sueño y la ausencia porque es lo único que
 * se arregla de un toque, y mientras siga abierta la sesión siguiente no se puede empezar.
 */
const forgottenSession: MascotRule = (context) => {
  const { lastSessionAt } = context.signals;
  if (lastSessionAt === null || !isStaleOpenSession(context)) return null;

  return { mood: 'nudging', reason: 'forgotten_session', openedAt: lastSessionAt };
};

const sleepy: MascotRule = ({ signals, now }) => {
  const days = daysSinceLastSession(signals.lastSessionAt, now);

  return days !== null && days >= SLEEPY_AFTER_DAYS
    ? { mood: 'sleepy', daysSinceLastSession: days }
    : null;
};

/**
 * La ausencia empuja antes que el estancamiento: tras varios días sin venir, sugerir más
 * peso es empujar a quien seguramente vuelve pudiendo menos.
 */
const nudging: MascotRule = ({ signals, now }) => {
  const days = daysSinceLastSession(signals.lastSessionAt, now);
  if (days !== null && days >= NUDGE_AFTER_DAYS) {
    return { mood: 'nudging', reason: 'absence', daysSinceLastSession: days };
  }

  if (signals.stalled.length > 0) {
    return {
      mood: 'nudging',
      reason: 'stagnation',
      stalledExerciseIds: signals.stalled.map((entry) => entry.trackedExerciseId),
    };
  }

  return null;
};

/**
 * La prioridad cuando coinciden varios estados; gana la primera regla que responde:
 *
 * 1. `celebrating` — una marca recién batida. Dura un minuto: si perdiera contra otro
 *    estado, no llegaría a verse nunca.
 * 2. `resting` — sesión abierta y descanso sin cumplir.
 * 3. `cheering` — sesión abierta, con actividad reciente y sin descanso pendiente. Con la
 *    sesión abierta se está en el gimnasio, así que la ausencia o el estancamiento no vienen
 *    a cuento.
 * 4. `nudging` por `forgotten_session` — sesión abierta sin actividad desde hace
 *    `STALE_SESSION_HOURS`: no se está en el gimnasio, se olvidó cerrarla.
 * 5. `sleepy` — una semana o más sin entrenar. Gana a la ausencia por el mismo motivo por
 *    el que la ausencia gana al estancamiento: primero hay que volver.
 * 6. `nudging` — días sin venir o ejercicios estancados, por ese orden.
 * 7. `idle` — lo que queda: no hay nada que decir, o todavía no ha entrenado nunca.
 */
const RULES: readonly MascotRule[] = [
  celebrating,
  resting,
  cheering,
  forgottenSession,
  sleepy,
  nudging,
];

/**
 * El estado de la mascota en el instante `now`. Quien entrena por primera vez queda en
 * `idle` y no en `nudging`: empujar es reprochar algo que se dejó de hacer, y ahí no hay
 * nada que se haya dejado.
 */
export function mascotState(
  signals: MascotTrainingSignals,
  device: MascotDeviceSignals,
  now: Date,
): MascotState {
  const context: MascotContext = { signals, device, now };

  for (const rule of RULES) {
    const state = rule(context);
    if (state !== null) return state;
  }

  return { mood: 'idle', reason: signals.lastSessionAt === null ? 'never_trained' : 'on_track' };
}
