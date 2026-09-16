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
  readonly set: ProgressionSet | CardioWeekSet;
}

/**
 * Una serie de cardio vista desde el calendario. Solo importa si fue calentamiento: es trabajo
 * hecho y cuenta como serie, pero no mueve gramos y no suma volumen.
 */
export interface CardioWeekSet {
  readonly kind: 'cardio';
  readonly isWarmup: boolean;
}

/**
 * Lo que trabajó una parte del cuerpo en un día. Solo aparecen partes con alguna serie efectiva:
 * un calentamiento suelto no es trabajo hecho en ninguna otra cuenta del dominio.
 */
export interface WeekBodyPartLoad {
  readonly bodyPart: BodyPart;
  /** Series efectivas: la medida con la que se oscurece la zona en la silueta. */
  readonly setCount: number;
  readonly volumeGrams: number;
}

/**
 * Un día de la semana en curso, ya resuelto a lo que se pinta. `trained` no se deduce del
 * volumen: un día de calistenia mueve cero gramos y sigue siendo un día de entrenamiento,
 * y un día entero de ejercicios propios sin clasificar no tiene partes y sí entrenó.
 */
export interface WeekDaySummary {
  /** 0 es lunes y 6 domingo, que es el orden en el que se pinta la fila. */
  readonly dayIndex: number;
  /** El día en `YYYY-MM-DD` UTC: sirve de clave y de "hoy" sin volver a calcular nada. */
  readonly date: string;
  readonly trained: boolean;
  /**
   * Todas las partes del cuerpo que trabajaron, de la que más a la que menos (ver
   * `comparesLoad`). Vacío si no hubo ninguna clasificable.
   */
  readonly bodyParts: readonly WeekBodyPartLoad[];
  /** Volumen efectivo del día entero, sumando lo que no se pudo clasificar. */
  readonly volumeGrams: number;
  /** Series efectivas del día entero. El calentamiento no cuenta, igual que en el volumen. */
  readonly setCount: number;
}

/**
 * Lo oscura que sale una zona de la silueta: de 1 (poco) a 4 (mucho). Son escalones fijos de
 * series y no relativos al día, para que el lunes y el jueves se puedan comparar entre sí.
 */
export type BodyPartLoadLevel = 1 | 2 | 3 | 4;

/**
 * Series efectivas desde las que empieza cada nivel. Tres series de un grupo es un toque; diez o
 * más, un día dedicado a él. Se cuentan series y no kilos: los kilos premian siempre a la pierna y
 * dan cero en peso corporal y en cardio.
 */
export const BODY_PART_LOAD_LEVEL_MIN_SETS: Readonly<Record<BodyPartLoadLevel, number>> = {
  1: 1,
  2: 4,
  3: 7,
  4: 10,
};

/** El nivel de una parte según sus series efectivas, o `null` si no hizo ninguna. */
export function bodyPartLoadLevel(setCount: number): BodyPartLoadLevel | null {
  if (setCount >= BODY_PART_LOAD_LEVEL_MIN_SETS[4]) return 4;
  if (setCount >= BODY_PART_LOAD_LEVEL_MIN_SETS[3]) return 3;
  if (setCount >= BODY_PART_LOAD_LEVEL_MIN_SETS[2]) return 2;
  if (setCount >= BODY_PART_LOAD_LEVEL_MIN_SETS[1]) return 1;
  return null;
}

/**
 * Los siete días de la semana en la que cae `now`, cada uno con lo que trabajó cada parte
 * del cuerpo. Devuelve siempre siete elementos: los días sin entrenar son parte del dibujo,
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
  const setsByDay = new Map<number, Map<BodyPart | null, WeekSetEntry['set'][]>>();

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
  setsByBodyPart: Map<BodyPart | null, WeekSetEntry['set'][]> | undefined,
): WeekDaySummary {
  const date = isoDateOfDay(absoluteDay);

  if (setsByBodyPart === undefined) {
    return { dayIndex, date, trained, bodyParts: [], volumeGrams: 0, setCount: 0 };
  }

  let volumeGrams = 0;
  let setCount = 0;
  const bodyParts: WeekBodyPartLoad[] = [];

  for (const [bodyPart, sets] of setsByBodyPart) {
    const strength = sets.filter((set): set is ProgressionSet => !('kind' in set));
    const volume = sessionVolumeGrams(strength);
    const cardioCount = sets.filter((set) => 'kind' in set && !set.isWarmup).length;
    const count = effectiveSets(strength).length + cardioCount;

    volumeGrams += volume;
    setCount += count;

    // Dos cosas suman al día sin salir en la silueta: lo que no se puede clasificar
    // —inventarle una parte del cuerpo sería peor que no marcar nada— y lo que solo tuvo
    // calentamiento, que no es trabajo hecho en ninguna otra cuenta del dominio.
    if (bodyPart !== null && count > 0) {
      bodyParts.push({ bodyPart, setCount: count, volumeGrams: volume });
    }
  }

  bodyParts.sort(comparesLoad);

  return { dayIndex, date, trained, bodyParts, volumeGrams, setCount };
}

/**
 * El orden de las partes de un día: primero la de más series, que es la que sale más oscura; si
 * empatan, la de más volumen, y el orden alfabético rompe el último empate para que la lista no
 * baile entre dos consultas iguales.
 */
function comparesLoad(a: WeekBodyPartLoad, b: WeekBodyPartLoad): number {
  if (a.setCount !== b.setCount) return b.setCount - a.setCount;
  if (a.volumeGrams !== b.volumeGrams) return b.volumeGrams - a.volumeGrams;
  return a.bodyPart < b.bodyPart ? -1 : a.bodyPart > b.bodyPart ? 1 : 0;
}
