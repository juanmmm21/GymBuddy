import type { BodyPart, TrackedExercise } from '@gymbuddy/shared';
import type { SelectOption } from '../../components/index';
import { BODY_PART_LABELS, BODY_PART_ORDER } from '../catalog/labels';

export interface ExerciseGroup {
  /** `null` es el grupo de los ejercicios propios sin parte del cuerpo asignada. */
  readonly bodyPart: BodyPart | null;
  readonly label: string;
  readonly items: readonly TrackedExercise[];
}

export const UNGROUPED_LABEL = 'Sin clasificar';

/**
 * "Mis ejercicios" por parte del cuerpo, en el orden en que se navega el catálogo y sin
 * grupos vacíos. Dentro de cada grupo se conserva el orden del Worker, y los ejercicios
 * sin parte del cuerpo cierran la lista: son los propios que el usuario no clasificó.
 */
export function groupExercisesByBodyPart(
  exercises: readonly TrackedExercise[],
): readonly ExerciseGroup[] {
  const byBodyPart = new Map<BodyPart, TrackedExercise[]>();
  const ungrouped: TrackedExercise[] = [];

  for (const exercise of exercises) {
    if (exercise.bodyPart === null) {
      ungrouped.push(exercise);
      continue;
    }
    const bucket = byBodyPart.get(exercise.bodyPart);
    if (bucket === undefined) {
      byBodyPart.set(exercise.bodyPart, [exercise]);
    } else {
      bucket.push(exercise);
    }
  }

  const groups: ExerciseGroup[] = [];
  for (const bodyPart of BODY_PART_ORDER) {
    const items = byBodyPart.get(bodyPart);
    if (items !== undefined) {
      groups.push({ bodyPart, label: BODY_PART_LABELS[bodyPart], items });
    }
  }
  if (ungrouped.length > 0) {
    groups.push({ bodyPart: null, label: UNGROUPED_LABEL, items: ungrouped });
  }
  return groups;
}

/**
 * Las opciones de un selector de ejercicios, con las mismas agrupaciones que "mis
 * ejercicios": se busca donde uno está acostumbrado. Un archivado solo llega aquí cuando
 * ya estaba elegido —una rutina puede nombrarlo— y se marca para que no parezca activo.
 */
export function exerciseSelectOptions(exercises: readonly TrackedExercise[]): SelectOption[] {
  return groupExercisesByBodyPart(exercises).flatMap((group) =>
    group.items.map((exercise) => ({
      value: exercise.id,
      label: exercise.archivedAt === null ? exercise.name : `${exercise.name} (archivado)`,
      group: group.label,
    })),
  );
}
