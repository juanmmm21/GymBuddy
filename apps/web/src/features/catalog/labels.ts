import type { BodyPart, Muscle } from '@gymbuddy/shared';

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

/** Los diecinueve músculos del catálogo: dan nombre a la ficha y a la carpeta del GIF. */
export const MUSCLE_LABELS: Readonly<Record<Muscle, string>> = {
  abductors: 'Abductores',
  abs: 'Abdominales',
  adductors: 'Aductores',
  biceps: 'Bíceps',
  calves: 'Gemelos',
  cardio: 'Cardio',
  delts: 'Deltoides',
  forearms: 'Antebrazos',
  glutes: 'Glúteos',
  hamstrings: 'Isquiotibiales',
  lats: 'Dorsales',
  'levator-scapulae': 'Elevador de la escápula',
  pectorals: 'Pectorales',
  quads: 'Cuádriceps',
  'serratus-anterior': 'Serrato anterior',
  spine: 'Lumbares',
  traps: 'Trapecios',
  triceps: 'Tríceps',
  'upper-back': 'Espalda alta',
};

/*
 * `equipment` y `category` no son enums en el contrato: son etiquetas descriptivas del
 * catálogo externo y una versión nueva puede añadir valores. Se traducen los doce y los
 * cuatro que publica el tag `v1.1.0`, verificados contra el CDN, y cualquier otro se pinta
 * legible en vez de romper la ficha.
 */
const EQUIPMENT_LABELS: Readonly<Record<string, string>> = {
  bodyweight: 'Peso corporal',
  dumbbell: 'Mancuerna',
  cable: 'Polea',
  barbell: 'Barra',
  lever: 'Máquina de palanca',
  band: 'Banda elástica',
  smith: 'Multipower',
  kettlebell: 'Kettlebell',
  'ez-bar': 'Barra Z',
  sled: 'Prensa / trineo',
  machine: 'Máquina',
  other: 'Otro',
};

const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  strength: 'Fuerza',
  stretching: 'Estiramiento',
  cardio: 'Cardio',
  plyometrics: 'Pliometría',
};

export function equipmentLabel(equipment: string): string {
  return EQUIPMENT_LABELS[equipment] ?? humanize(equipment);
}

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? humanize(category);
}

/** "ez-bar" → "Ez bar": legible sin inventar una traducción que no existe. */
export function humanize(value: string): string {
  const spaced = value.replace(/[-_]+/g, ' ').trim();
  if (spaced === '') return value;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
