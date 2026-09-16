import type { BodyPart, Locale, ResourceId, SetEntry, TrackedExercise } from '@gymbuddy/shared';
import {
  formatCardioDuration,
  formatDistanceLabel,
  formatWeightInUnit,
  PER_ARM,
} from '../../lib/format';
import { BODY_PART_LABELS, BODY_PART_ORDER } from '../catalog/labels';
import { groupExercisesByBodyPart, UNGROUPED_LABEL } from '../exercises/grouping';
import type { RoutineProgress } from './routine-progress';
import { proposeCardioSet, proposeSet, setKindFor } from './set-proposal';

/** Cómo va un ejercicio de la rutina en la sesión: el que toca, uno ya terminado o ninguno de los dos. */
export type ExercisePickerRowStatus = 'current' | 'done' | 'pending';

export interface ExercisePickerRow {
  readonly exercise: TrackedExercise;
  /** Solo en la sección de la rutina; fuera de ella siempre `pending`. */
  readonly status: ExercisePickerRowStatus;
}

export interface ExercisePickerSection {
  /** Estable entre repintados: sirve de clave de React y de id del título. */
  readonly key: string;
  readonly title: string;
  readonly rows: readonly ExercisePickerRow[];
}

export interface ExercisePickerFilter {
  /** Lo tecleado en el buscador, tal cual. */
  readonly text: string;
  /** La parte del cuerpo de los chips; `null` es «Todos». */
  readonly bodyPart: BodyPart | null;
}

export interface ExercisePickerContext {
  /** La rutina que guía la sesión, si la hay: sus ejercicios van arriba. */
  readonly routineProgress: RoutineProgress | null;
  /** El que está elegido en la hoja: sin rutina, arriba van los de su misma parte del cuerpo. */
  readonly selected: TrackedExercise;
  readonly filter: ExercisePickerFilter;
}

export const NO_PICKER_FILTER: ExercisePickerFilter = { text: '', bodyPart: null };

export const ROUTINE_SECTION_TITLE = 'En la rutina';

/**
 * Las secciones de la lista para elegir ejercicio al registrar (opción A que eligió Juan el
 * 2026-09-16). Arriba, lo que probablemente se busca: **con rutina, sus ejercicios en su orden**;
 * **sin rutina, los guardados de la misma parte del cuerpo que el elegido** (lo pidió Juan: si
 * estás con pecho, lo siguiente suele ser pecho). Debajo, el resto agrupado como en «Mis
 * ejercicios». Un ejercicio sale una sola vez, y el buscador y los chips filtran todas las secciones.
 */
export function exercisePickerSections(
  exercises: readonly TrackedExercise[],
  { routineProgress, selected, filter }: ExercisePickerContext,
): readonly ExercisePickerSection[] {
  const visible = exercises.filter((exercise) => matchesPickerFilter(exercise, filter));
  const top =
    routineProgress !== null && routineProgress.lines.length > 0
      ? routineSection(visible, routineProgress)
      : sameBodyPartSection(visible, selected);

  const shown = new Set(top?.rows.map((row) => row.exercise.id) ?? []);
  const rest = groupExercisesByBodyPart(visible.filter((exercise) => !shown.has(exercise.id))).map(
    (group): ExercisePickerSection => ({
      key: `group-${group.bodyPart ?? 'none'}`,
      title: group.label,
      rows: group.items.map((exercise) => ({ exercise, status: 'pending' })),
    }),
  );

  return top === null || top.rows.length === 0 ? rest : [top, ...rest];
}

function routineSection(
  visible: readonly TrackedExercise[],
  progress: RoutineProgress,
): ExercisePickerSection {
  const byId = new Map(visible.map((exercise) => [exercise.id, exercise]));
  const currentId = progress.current?.item.trackedExerciseId ?? null;
  const rows: ExercisePickerRow[] = [];
  const seen = new Set<ResourceId>();

  // El mismo ejercicio puede ir en dos bloques: sale una vez, en el sitio del primero, y solo está
  // hecho cuando lo están todos sus bloques.
  for (const line of progress.lines) {
    const id = line.item.trackedExerciseId;
    const exercise = byId.get(id);
    if (exercise === undefined || seen.has(id)) continue;
    seen.add(id);

    const lines = progress.lines.filter((other) => other.item.trackedExerciseId === id);
    const status: ExercisePickerRowStatus =
      id === currentId ? 'current' : lines.every((other) => other.complete) ? 'done' : 'pending';
    rows.push({ exercise, status });
  }

  return { key: 'routine', title: ROUTINE_SECTION_TITLE, rows };
}

function sameBodyPartSection(
  visible: readonly TrackedExercise[],
  selected: TrackedExercise,
): ExercisePickerSection | null {
  if (selected.bodyPart === null) return null;

  const { bodyPart } = selected;
  return {
    key: 'same-body-part',
    title: sameBodyPartTitle(bodyPart),
    rows: visible
      .filter((exercise) => exercise.bodyPart === bodyPart)
      .map((exercise) => ({ exercise, status: 'pending' })),
  };
}

export function sameBodyPartTitle(bodyPart: BodyPart): string {
  return `Mismo grupo: ${BODY_PART_LABELS[bodyPart]}`;
}

/**
 * Casa si **cada palabra** tecleada aparece en el nombre, sin mayúsculas ni tildes: «press incl»
 * encuentra «Press inclinado» y «sentadilla» encuentra «Sentadílla» escrito con prisa. Es local a
 * propósito: la lista son los ejercicios que ya sigue el usuario y tiene que funcionar sin red.
 */
export function matchesPickerFilter(
  exercise: TrackedExercise,
  filter: ExercisePickerFilter,
): boolean {
  if (filter.bodyPart !== null && exercise.bodyPart !== filter.bodyPart) return false;

  const words = foldForSearch(filter.text)
    .split(/\s+/)
    .filter((word) => word !== '');
  if (words.length === 0) return true;

  const name = foldForSearch(exercise.name);
  return words.every((word) => name.includes(word));
}

function foldForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es');
}

/**
 * Los chips de parte del cuerpo: solo las que tienen algún ejercicio, en el orden del catálogo. Los
 * propios sin clasificar no tienen chip; se encuentran con «Todos» o buscando.
 */
export function pickerBodyParts(exercises: readonly TrackedExercise[]): readonly BodyPart[] {
  const present = new Set(exercises.map((exercise) => exercise.bodyPart));
  return BODY_PART_ORDER.filter((bodyPart) => present.has(bodyPart));
}

/**
 * Lo que se lee bajo el nombre de una fila: «Pecho · 82,5 kg × 8». La cifra es la misma que se
 * precargaría al elegirlo (`proposeSet`: hoy primero, luego la última vez), así la fila no promete
 * algo distinto de lo que aparece en el formulario. Juan dejó elegir si enseñarla; se enseña porque
 * distingue variantes de nombre parecido («Press inclinado» con barra o con mancuernas).
 */
export function pickerRowDetail(
  exercise: TrackedExercise,
  sessionSets: readonly SetEntry[],
  locale: Locale,
): string {
  const parts = [
    exercise.bodyPart === null ? UNGROUPED_LABEL : BODY_PART_LABELS[exercise.bodyPart],
    lastSetLabel(exercise, sessionSets, locale),
  ];
  if (exercise.archivedAt !== null) parts.push('archivado');
  return parts.join(' · ');
}

export const NO_SETS_LABEL = 'Sin series';

function lastSetLabel(
  exercise: TrackedExercise,
  sessionSets: readonly SetEntry[],
  locale: Locale,
): string {
  if (setKindFor(exercise) === 'cardio') {
    const { values, source } = proposeCardioSet(exercise, sessionSets);
    if (source === 'none' || values.durationSeconds === null) return NO_SETS_LABEL;
    const duration = formatCardioDuration(values.durationSeconds);
    return values.distanceMeters === null
      ? duration
      : `${duration} · ${formatDistanceLabel(values.distanceMeters, locale)}`;
  }

  const { values, source } = proposeSet(exercise, sessionSets);
  if (source === 'none' || values.weightGrams === null || values.reps === null) {
    return NO_SETS_LABEL;
  }
  const weight = formatWeightInUnit(values.weightGrams, 'kg', locale);
  return `${exercise.unilateral ? `${weight} ${PER_ARM}` : weight} × ${String(values.reps)}`;
}

/**
 * Lo que ocupa el hueco de la miniatura en un ejercicio sin GIF (los propios): sus dos primeras
 * iniciales, para que la fila no parezca una imagen que no ha cargado.
 */
export function exerciseInitials(name: string): string {
  const words = name.split(/\s+/).filter((word) => /^\p{L}/u.test(word));
  // «Curl con la barra rara» es «CB» y no «CC»: las palabras cortas no dicen qué ejercicio es.
  const meaningful = words.filter((word) => word.length > 3);
  const letters = (meaningful.length > 0 ? meaningful : words)
    .slice(0, 2)
    .map((word) => word.charAt(0).toLocaleUpperCase('es'));
  return letters.length === 0 ? name.trim().charAt(0).toLocaleUpperCase('es') : letters.join('');
}
