import type { BodyPart } from '@gymbuddy/shared';

/**
 * Nombres de las siete partes del cuerpo por las que se navega. Son `bodyPart`, no
 * `muscle`: el pecho es `chest` aquí y `pectorals` en la ficha del ejercicio.
 */
export const BODY_PART_LABELS: Readonly<Record<BodyPart, string>> = {
  arms: 'Brazos',
  back: 'Espalda',
  cardio: 'Cardio',
  chest: 'Pecho',
  core: 'Core',
  legs: 'Piernas',
  shoulders: 'Hombros',
};

/** Orden en el que se listan: de lo que más se entrena a lo que menos. */
export const BODY_PART_ORDER: readonly BodyPart[] = [
  'chest',
  'back',
  'legs',
  'shoulders',
  'arms',
  'core',
  'cardio',
];
