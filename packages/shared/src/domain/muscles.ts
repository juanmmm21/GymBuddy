import type { BodyPart, Muscle } from '../schemas/catalog';

/**
 * La parte del cuerpo de cada músculo. En el tag del catálogo cada uno de los diecinueve cae
 * siempre en la misma (comprobado contra `api/en/exercises.json` de `v1.1.0`), así que es una
 * función y no una relación: un ejercicio propio con «glúteos» es de piernas, y aceptar
 * «glúteos» en pecho lo pondría en un grupo de «Mis ejercicios» y en el calendario donde nadie lo
 * buscaría. Es un `Record` cerrado a propósito: un músculo nuevo en el contrato no compila hasta
 * decir dónde va.
 */
export const MUSCLE_BODY_PART: Readonly<Record<Muscle, BodyPart>> = {
  abductors: 'legs',
  abs: 'core',
  adductors: 'legs',
  biceps: 'arms',
  calves: 'legs',
  cardio: 'cardio',
  delts: 'shoulders',
  forearms: 'arms',
  glutes: 'legs',
  hamstrings: 'legs',
  lats: 'back',
  'levator-scapulae': 'back',
  pectorals: 'chest',
  quads: 'legs',
  'serratus-anterior': 'chest',
  spine: 'back',
  traps: 'back',
  triceps: 'arms',
  'upper-back': 'back',
};

export function bodyPartOfMuscle(muscle: Muscle): BodyPart {
  return MUSCLE_BODY_PART[muscle];
}

/** Los músculos de una parte del cuerpo, en el orden del contrato: lo que ofrece un selector. */
export function musclesOfBodyPart(bodyPart: BodyPart): readonly Muscle[] {
  return (Object.keys(MUSCLE_BODY_PART) as Muscle[]).filter(
    (muscle) => MUSCLE_BODY_PART[muscle] === bodyPart,
  );
}

/**
 * Si un músculo y una parte del cuerpo pueden ir juntos en una ficha. Cualquiera de los dos puede
 * faltar —un ejercicio propio no tiene por qué clasificarse—; lo que no vale es que se contradigan.
 */
export function isMuscleInBodyPart(
  muscle: Muscle | null | undefined,
  bodyPart: BodyPart | null | undefined,
): boolean {
  if (muscle === null || muscle === undefined || bodyPart === null || bodyPart === undefined) {
    return true;
  }
  return MUSCLE_BODY_PART[muscle] === bodyPart;
}
