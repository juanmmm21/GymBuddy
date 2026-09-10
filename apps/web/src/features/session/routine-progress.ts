import type { ResourceId, RoutineItem, SetEntry } from '@gymbuddy/shared';
import { formatRepsRange } from '../routines/items';

/** Una línea de la rutina con las series de la sesión que le han tocado. */
export interface RoutineLineProgress {
  readonly item: RoutineItem;
  /**
   * Series efectivas repartidas a esta línea. Puede pasar del objetivo en el último bloque
   * de un ejercicio: lo que se hace de más se cuenta ahí en vez de perderse.
   */
  readonly doneSets: number;
  readonly complete: boolean;
}

export interface RoutineProgress {
  /** Las líneas en el orden de la rutina. */
  readonly lines: readonly RoutineLineProgress[];
  /** La que toca ahora, o `null` si ya están todas hechas o la rutina no tiene ninguna. */
  readonly current: RoutineLineProgress | null;
  readonly completedLines: number;
}

/**
 * Reparte las series de la sesión entre las líneas de la rutina que la guía. La sesión no
 * guarda qué serie iba a qué línea (`workout_session` no conoce las rutinas), así que el
 * reparto se deriva cada vez, igual que el descanso.
 *
 * El mismo ejercicio puede ir en dos líneas —dos bloques—, por eso no se indexa por
 * ejercicio: sus series llenan la primera hasta su objetivo y el resto pasa a la siguiente.
 * El calentamiento no cuenta, y una serie de un ejercicio que no está en la rutina se hizo
 * fuera del guion y no se reparte.
 */
export function routineProgress(
  items: readonly RoutineItem[],
  sets: readonly SetEntry[],
): RoutineProgress {
  const counts = [...items]
    .sort((left, right) => left.orderIndex - right.orderIndex)
    .map((item) => ({ item, doneSets: 0 }));
  const effective = sets
    .filter((set) => !set.isWarmup)
    .sort((left, right) => left.orderIndex - right.orderIndex);

  let lastTouched: number | null = null;
  for (const set of effective) {
    const index = blockIndexFor(counts, set.trackedExerciseId);
    const line = index === null ? undefined : counts[index];
    if (index === null || line === undefined) continue;

    line.doneSets += 1;
    lastTouched = index;
  }

  const lines = counts.map((line): RoutineLineProgress => ({
    item: line.item,
    doneSets: line.doneSets,
    complete: line.doneSets >= line.item.targetSets,
  }));

  return {
    lines,
    current: currentLine(lines, lastTouched),
    completedLines: lines.filter((line) => line.complete).length,
  };
}

/**
 * La línea a la que irá la próxima serie de ese ejercicio, con la misma regla que el
 * reparto: el primer bloque sin terminar o, si están todos, el último. `null` si el
 * ejercicio no está en la rutina.
 */
export function lineForNextSet(
  progress: RoutineProgress,
  trackedExerciseId: ResourceId,
): RoutineLineProgress | null {
  const index = blockIndexFor(progress.lines, trackedExerciseId);
  return index === null ? null : (progress.lines[index] ?? null);
}

/** "Rutina: 6–8 reps · serie 3 de 4": lo que se lee bajo las repeticiones al registrar. */
export function describeNextSet(line: RoutineLineProgress): string {
  const reps = formatRepsRange(line.item.targetRepsMin, line.item.targetRepsMax);
  const { doneSets } = line;
  const { targetSets } = line.item;

  return doneSets < targetSets
    ? `Rutina: ${reps} · serie ${String(doneSets + 1)} de ${String(targetSets)}`
    : `Rutina: ${reps} · ya llevas las ${String(targetSets)} series`;
}

function blockIndexFor(
  lines: readonly { readonly item: RoutineItem; readonly doneSets: number }[],
  trackedExerciseId: ResourceId,
): number | null {
  let last: number | null = null;

  for (const [index, line] of lines.entries()) {
    if (line.item.trackedExerciseId !== trackedExerciseId) continue;
    if (line.doneSets < line.item.targetSets) return index;
    last = index;
  }

  return last;
}

/**
 * Manda lo que se está haciendo: si la última serie cayó en una línea sin terminar, sigue
 * siendo esa aunque haya otra anterior a medias —en el gimnasio se salta una máquina
 * ocupada y se vuelve luego—. Terminada esa, toca la primera pendiente en el orden.
 */
function currentLine(
  lines: readonly RoutineLineProgress[],
  lastTouched: number | null,
): RoutineLineProgress | null {
  const touched = lastTouched === null ? undefined : lines[lastTouched];
  if (touched !== undefined && !touched.complete) return touched;

  return lines.find((line) => !line.complete) ?? null;
}
