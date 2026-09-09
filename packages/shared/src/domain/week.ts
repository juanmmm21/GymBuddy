/**
 * La semana de entrenamiento: la aritmética de "en qué semana y en qué día cae este
 * instante" y el resumen que pinta el mini calendario de Hoy.
 *
 * Todo se calcula con **índices enteros de días** desde la época, nunca construyendo
 * fechas: el mismo número tiene que salir en el Worker y en el navegador, y ahí un
 * `Date` con la zona local del móvil rompería el acuerdo. La semana va de lunes a
 * domingo, igual que la racha de `signals.ts`, que usa `weekIndexOf` de aquí.
 */

import type { BodyPart } from '../schemas/catalog';
import { effectiveSets, sessionVolumeGrams, type ProgressionSet } from './progression';

const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * 1970-01-01 fue jueves, así que desplazar tres días deja los lunes en el corte: el índice
 * de semana cambia justo al empezar la semana, sin construir un `Date` por sesión.
 */
const EPOCH_WEEKDAY_OFFSET = 3;

export const DAYS_PER_WEEK = 7;

/**
 * Una serie con el contexto que necesita el calendario: a qué día cae —el de la sesión, no
 * el de la serie, para que una sesión que cruza la medianoche no se parta en dos— y qué
 * parte del cuerpo trabaja. `bodyPart` es nulo en un ejercicio propio sin clasificar.
 */
export interface WeekSetEntry {
  readonly sessionStartedAt: string;
  readonly bodyPart: BodyPart | null;
  readonly set: ProgressionSet;
}

/**
 * Un día de la semana en curso, ya resuelto a lo que se pinta. `trained` no se deduce del
 * volumen: un día de calistenia mueve cero gramos y sigue siendo un día de entrenamiento,
 * y un día entero de ejercicios propios sin clasificar tiene `bodyPart` nulo sin estar vacío.
 */
export interface WeekDaySummary {
  /** 0 es lunes y 6 domingo, que es el orden en el que se pinta la fila. */
  readonly dayIndex: number;
  /** El día en `YYYY-MM-DD` UTC: sirve de clave y de "hoy" sin volver a calcular nada. */
  readonly date: string;
  readonly trained: boolean;
  /** La parte del cuerpo con más volumen del día, o `null` si no hay ninguna clasificable. */
  readonly bodyPart: BodyPart | null;
  /** Volumen efectivo del día entero, no solo el de la parte dominante. */
  readonly volumeGrams: number;
  /** Series efectivas del día entero. El calentamiento no cuenta, igual que en el volumen. */
  readonly setCount: number;
}

interface BodyPartTotals {
  readonly volumeGrams: number;
  readonly setCount: number;
}

/**
 * Los siete días de la semana en la que cae `now`, cada uno con su parte del cuerpo
 * dominante. Devuelve siempre siete elementos: los días sin entrenar son parte del dibujo,
 * y un hueco que la pantalla tuviera que rellenar sería la misma lógica escrita dos veces.
 *
 * Las entradas de otra semana se descartan aquí aunque el Worker ya filtre: la función es
 * pura y tiene que ser correcta por sí sola. Una fecha ilegible cae con ellas, porque
 * `Date.parse` devuelve `NaN` y ningún índice de semana coincide con `NaN`.
 */
export function weeklyBodyPartCalendar(
  entries: readonly WeekSetEntry[],
  now: Date,
): WeekDaySummary[] {
  const week = weekIndexOf(now.getTime());
  const weekStart = weekStartDayIndex(week);

  const trainedDays = new Set<number>();
  const setsByDay = new Map<number, Map<BodyPart | null, ProgressionSet[]>>();

  for (const entry of entries) {
    const timestamp = Date.parse(entry.sessionStartedAt);
    if (weekIndexOf(timestamp) !== week) continue;

    const day = dayIndexOf(timestamp) - weekStart;
    trainedDays.add(day);

    let byBodyPart = setsByDay.get(day);
    if (byBodyPart === undefined) {
      byBodyPart = new Map();
      setsByDay.set(day, byBodyPart);
    }

    const sets = byBodyPart.get(entry.bodyPart);
    if (sets === undefined) {
      byBodyPart.set(entry.bodyPart, [entry.set]);
    } else {
      sets.push(entry.set);
    }
  }

  return Array.from({ length: DAYS_PER_WEEK }, (_unused, dayIndex) =>
    summarizeDay(
      dayIndex,
      weekStart + dayIndex,
      trainedDays.has(dayIndex),
      setsByDay.get(dayIndex),
    ),
  );
}

/**
 * Índice de la semana (lunes a domingo) en la que cae un instante. Comparar índices evita
 * construir fechas y deja el cálculo idéntico en el Worker y en el navegador.
 */
export function weekIndexOf(timestamp: number): number {
  return Math.floor((dayIndexOf(timestamp) + EPOCH_WEEKDAY_OFFSET) / DAYS_PER_WEEK);
}

/** Días completos transcurridos desde la época hasta un instante, en UTC. */
export function dayIndexOf(timestamp: number): number {
  return Math.floor(timestamp / MILLISECONDS_PER_DAY);
}

/** El día (índice desde la época) en el que empieza una semana: su lunes. */
export function weekStartDayIndex(weekIndex: number): number {
  return weekIndex * DAYS_PER_WEEK - EPOCH_WEEKDAY_OFFSET;
}

/** Un día de la época como fecha `YYYY-MM-DD` en UTC, que es como viaja en el contrato. */
export function isoDateOfDay(dayIndex: number): string {
  return new Date(dayIndex * MILLISECONDS_PER_DAY).toISOString().slice(0, 10);
}

function summarizeDay(
  dayIndex: number,
  absoluteDay: number,
  trained: boolean,
  setsByBodyPart: Map<BodyPart | null, ProgressionSet[]> | undefined,
): WeekDaySummary {
  const date = isoDateOfDay(absoluteDay);

  if (setsByBodyPart === undefined) {
    return { dayIndex, date, trained, bodyPart: null, volumeGrams: 0, setCount: 0 };
  }

  let volumeGrams = 0;
  let setCount = 0;
  const totals = new Map<BodyPart, BodyPartTotals>();

  for (const [bodyPart, sets] of setsByBodyPart) {
    const volume = sessionVolumeGrams(sets);
    const count = effectiveSets(sets).length;

    volumeGrams += volume;
    setCount += count;

    // Dos cosas suman al día sin competir por la etiqueta: lo que no se puede clasificar
    // —inventarle una parte del cuerpo sería peor que dejar el día sin nombre— y lo que
    // solo tuvo calentamiento, que no es trabajo hecho en ninguna otra cuenta del dominio.
    if (bodyPart !== null && count > 0) {
      totals.set(bodyPart, { volumeGrams: volume, setCount: count });
    }
  }

  return { dayIndex, date, trained, bodyPart: dominantBodyPart(totals), volumeGrams, setCount };
}

/**
 * La parte del cuerpo del día. Manda el volumen; si empata —y empata siempre en un día de
 * peso corporal, donde todo vale cero— decide el número de series, y el orden alfabético
 * rompe el último empate para que la etiqueta no baile entre dos consultas iguales.
 */
function dominantBodyPart(totals: ReadonlyMap<BodyPart, BodyPartTotals>): BodyPart | null {
  let best: BodyPart | null = null;
  let bestTotals: BodyPartTotals | null = null;

  for (const [bodyPart, candidate] of totals) {
    if (bestTotals === null || comparesDominant(bodyPart, candidate, best, bestTotals)) {
      best = bodyPart;
      bestTotals = candidate;
    }
  }

  return best;
}

function comparesDominant(
  candidate: BodyPart,
  candidateTotals: BodyPartTotals,
  best: BodyPart | null,
  bestTotals: BodyPartTotals,
): boolean {
  if (candidateTotals.volumeGrams !== bestTotals.volumeGrams) {
    return candidateTotals.volumeGrams > bestTotals.volumeGrams;
  }
  if (candidateTotals.setCount !== bestTotals.setCount) {
    return candidateTotals.setCount > bestTotals.setCount;
  }

  return best === null || candidate < best;
}
