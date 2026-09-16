import {
  bodyPartSchema,
  createTrackedExerciseRequestSchema,
  isMuscleInBodyPart,
  muscleSchema,
  musclesOfBodyPart,
  type BodyPart,
  type CreateTrackedExerciseRequest,
  type ResourceId,
} from '@gymbuddy/shared';
import type { SelectOption } from '../../components/index';
import { BODY_PART_LABELS, BODY_PART_ORDER, MUSCLE_LABELS } from '../catalog/labels';

export type CreateCustomExerciseRequest = Extract<
  CreateTrackedExerciseRequest,
  { origin: 'custom' }
>;

/** Lo que hay tecleado y elegido en la hoja, tal cual lo dan los campos: todo texto. */
export interface CustomExerciseDraft {
  readonly name: string;
  /** Una `BodyPart`, o `''` mientras no se ha elegido. */
  readonly bodyPart: string;
  /** Un `Muscle`, o `''` para dejarlo sin concretar. */
  readonly muscle: string;
  /** El interruptor «A un brazo». */
  readonly unilateral: boolean;
}

/** El valor de los desplegables cuando no hay nada elegido. */
export const UNSELECTED = '';

/**
 * La parte del cuerpo se pide siempre aunque el contrato la admita nula: decide el grupo de «Mis
 * ejercicios», la etiqueta del día en la semana de Hoy y el incremento que sugiere el
 * estancamiento, y un ejercicio que se queda en «Sin clasificar» ya no se vuelve a clasificar
 * (la edición no la ofrece).
 */
export function bodyPartSelectOptions(): SelectOption[] {
  return [
    { value: UNSELECTED, label: 'Elige una' },
    ...BODY_PART_ORDER.map((bodyPart) => ({ value: bodyPart, label: BODY_PART_LABELS[bodyPart] })),
  ];
}

/** Solo los músculos de la parte elegida: ofrecer los diecinueve dejaría elegir uno que no cuadra. */
export function muscleSelectOptions(bodyPart: BodyPart | null): SelectOption[] {
  const muscles = bodyPart === null ? [] : musclesOfBodyPart(bodyPart);
  return [
    { value: UNSELECTED, label: 'Sin concretar' },
    ...muscles.map((muscle) => ({ value: muscle, label: MUSCLE_LABELS[muscle] })),
  ];
}

export function parseDraftBodyPart(value: string): BodyPart | null {
  const parsed = bodyPartSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * El músculo que sigue valiendo al cambiar de parte del cuerpo: el mismo si pertenece a la nueva
 * y ninguno si no, para que el formulario nunca enseñe un par que el Worker rechazaría.
 */
export function reconcileMuscle(muscle: string, bodyPart: BodyPart | null): string {
  const parsed = muscleSchema.safeParse(muscle);
  if (!parsed.success || bodyPart === null) return UNSELECTED;
  return isMuscleInBodyPart(parsed.data, bodyPart) ? parsed.data : UNSELECTED;
}

/**
 * La petición de alta, o `null` si al borrador le falta algo. Pasa por el esquema del contrato
 * —el mismo con el que valida el Worker— para que el botón no se active con algo que va a volver
 * como `validation_failed`.
 */
export function toCustomExerciseRequest(
  id: ResourceId,
  draft: CustomExerciseDraft,
): CreateCustomExerciseRequest | null {
  const bodyPart = parseDraftBodyPart(draft.bodyPart);
  if (bodyPart === null) return null;

  const muscle = draft.muscle === UNSELECTED ? null : draft.muscle;
  const parsed = createTrackedExerciseRequestSchema.safeParse({
    id,
    origin: 'custom',
    name: draft.name,
    bodyPart,
    muscle,
    unilateral: offersUnilateral(bodyPart) && draft.unilateral,
  });
  if (!parsed.success || parsed.data.origin !== 'custom') return null;
  return parsed.data;
}

/**
 * Si tiene sentido preguntar «A un brazo» para una parte del cuerpo. En cardio no: sus series son de
 * tiempo y no llevan peso que repartir entre brazos. Sin parte elegida tampoco se sabe, así que no.
 */
export function offersUnilateral(bodyPart: BodyPart | null): boolean {
  return bodyPart !== null && bodyPart !== 'cardio';
}

/**
 * El nombre con el que arranca la hoja cuando se abre desde una búsqueda sin resultados: lo que se
 * buscó, sin espacios de más y con mayúscula inicial, que es como se escribe un nombre en la lista.
 */
export function suggestedExerciseName(searchTerm: string): string {
  const collapsed = searchTerm.trim().replace(/\s+/g, ' ');
  if (collapsed === '') return '';
  return collapsed.charAt(0).toLocaleUpperCase('es') + collapsed.slice(1);
}
