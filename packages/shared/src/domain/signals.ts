/**
 * Señales de progreso: días sin entrenar, racha de semanas y estancamiento. No son
 * estadísticas de adorno — son la entrada de la máquina de estados de la mascota
 * (`AGENTS.md` §5), así que su forma de salida está pensada ya como entrada de aquello.
 */

import type { BodyPart } from '../schemas/catalog';
import type { SessionTopSet } from './progression';
import { weekIndexOf } from './week';

const MILLISECONDS_PER_DAY = 86_400_000;

/** Sesiones seguidas con el mismo peso a partir de las cuales se sugiere subir. */
export const STAGNATION_SESSIONS = 3;

/** Incrementos sugeridos: los discos pequeños existen para los empujes de tren superior. */
const SMALL_INCREMENT_GRAMS = 2500;
const LARGE_INCREMENT_GRAMS = 5000;
const LARGE_INCREMENT_BODY_PARTS: readonly BodyPart[] = ['legs', 'core'];

/** Repeticiones que se consideran cumplidas en un ejercicio; lo fija la rutina (fase 10). */
export interface RepRange {
  readonly min: number;
  readonly max: number;
}

/** Un ejercicio atascado en el mismo peso, con cuánto conviene subirlo. */
export interface StagnationSignal {
  readonly weightGrams: number;
  readonly sessions: number;
  readonly suggestedIncrementGrams: number;
}

/**
 * Días completos desde la última sesión. Se cuentan periodos de veinticuatro horas y no
 * días de calendario: el calendario depende de la zona del usuario y esto se calcula en
 * los dos lados. `null` es "todavía no ha entrenado nunca", que no es lo mismo que cero.
 */
export function daysSinceLastSession(lastSessionAt: string | null, now: Date): number | null {
  if (lastSessionAt === null) return null;

  const elapsed = now.getTime() - Date.parse(lastSessionAt);

  // Una sesión abierta ahora mismo puede tener una marca ligeramente futura si el reloj
  // del móvil va adelantado; eso son cero días, no un número negativo.
  return elapsed <= 0 ? 0 : Math.floor(elapsed / MILLISECONDS_PER_DAY);
}

/**
 * Semanas consecutivas con al menos una sesión, contando hacia atrás. Si la semana en
 * curso todavía no tiene ninguna, la racha no se rompe: la semana no ha terminado y
 * castigar el lunes por la mañana lo que aún se puede hacer el sábado sería mentir.
 */
export function weeklyStreak(sessionStarts: readonly string[], now: Date): number {
  const currentWeek = weekIndexOf(now.getTime());
  const weeks = new Set<number>();

  for (const start of sessionStarts) {
    const week = weekIndexOf(Date.parse(start));
    // Una marca futura (reloj del móvil adelantado) no puede inaugurar una semana que aún
    // no existe: se cuenta en la semana en curso.
    weeks.add(Math.min(week, currentWeek));
  }

  let week = weeks.has(currentWeek) ? currentWeek : currentWeek - 1;
  let streak = 0;
  while (weeks.has(week)) {
    streak += 1;
    week -= 1;
  }

  return streak;
}

/** Sesiones de la semana en curso. Es lo que la mascota enseña como "llevas dos esta semana". */
export function sessionsThisWeek(sessionStarts: readonly string[], now: Date): number {
  const currentWeek = weekIndexOf(now.getTime());

  return sessionStarts.filter((start) => weekIndexOf(Date.parse(start)) === currentWeek).length;
}

/**
 * Estancamiento: el mismo peso en la serie más pesada durante `STAGNATION_SESSIONS`
 * sesiones seguidas del ejercicio, sin que las repeticiones se hayan venido abajo.
 *
 * La condición de repeticiones es lo que evita el mal consejo: quien repite peso mientras
 * pierde repeticiones no está estancado, está pudiendo menos, y sugerirle subir el peso
 * sería empujarle en la dirección contraria. Con una rutina que fije el rango objetivo
 * (fase 10) se exige alcanzarlo; sin ella, basta con que las repeticiones no bajen.
 */
export function detectStagnation(
  topSets: readonly SessionTopSet[],
  bodyPart: BodyPart | null,
  targetReps: RepRange | null = null,
): StagnationSignal | null {
  const ordered = [...topSets].sort(
    (left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt),
  );

  const [latest] = ordered;
  if (latest === undefined) return null;

  // La racha se corta en la primera sesión con otro peso, no en la primera que coincide.
  let run = 0;
  while (ordered[run]?.weightGrams === latest.weightGrams) run += 1;

  const streak = ordered.slice(0, run);
  if (streak.length < STAGNATION_SESSIONS) return null;

  const oldest = streak[streak.length - 1];
  if (oldest === undefined) return null;

  const repsHold =
    targetReps === null
      ? latest.reps >= oldest.reps
      : streak.every((top) => top.reps >= targetReps.min);
  if (!repsHold) return null;

  return {
    weightGrams: latest.weightGrams,
    sessions: streak.length,
    suggestedIncrementGrams: suggestedIncrementGrams(bodyPart),
  };
}

/**
 * Cuánto subir. El tren inferior admite el salto grande; para lo demás —y para lo que no
 * sabemos clasificar— se usa el disco pequeño: equivocarse a la baja solo cuesta una semana.
 */
export function suggestedIncrementGrams(bodyPart: BodyPart | null): number {
  return bodyPart !== null && LARGE_INCREMENT_BODY_PARTS.includes(bodyPart)
    ? LARGE_INCREMENT_GRAMS
    : SMALL_INCREMENT_GRAMS;
}
