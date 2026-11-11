import type { BodyPart, Locale, Muscle } from '@gymbuddy/shared';
import { currentLocale } from '../../i18n/index';

/**
 * Nombres de las siete partes del cuerpo por las que se navega. Son `bodyPart`, no
 * `muscle`: el pecho es `chest` aquí y `pectorals` en la ficha del ejercicio.
 */
const BODY_PART_LABELS: Readonly<Record<Locale, Readonly<Record<BodyPart, string>>>> = {
  es: {
    arms: 'Brazos',
    back: 'Espalda',
    cardio: 'Cardio',
    chest: 'Pecho',
    core: 'Core',
    legs: 'Piernas',
    shoulders: 'Hombros',
  },
  en: {
    arms: 'Arms',
    back: 'Back',
    cardio: 'Cardio',
    chest: 'Chest',
    core: 'Core',
    legs: 'Legs',
    shoulders: 'Shoulders',
  },
};

export function bodyPartLabel(bodyPart: BodyPart): string {
  return BODY_PART_LABELS[currentLocale()][bodyPart];
}

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
const MUSCLE_LABELS: Readonly<Record<Locale, Readonly<Record<Muscle, string>>>> = {
  es: {
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
  },
  en: {
    abductors: 'Abductors',
    abs: 'Abs',
    adductors: 'Adductors',
    biceps: 'Biceps',
    calves: 'Calves',
    cardio: 'Cardio',
    delts: 'Delts',
    forearms: 'Forearms',
    glutes: 'Glutes',
    hamstrings: 'Hamstrings',
    lats: 'Lats',
    'levator-scapulae': 'Levator scapulae',
    pectorals: 'Pectorals',
    quads: 'Quads',
    'serratus-anterior': 'Serratus anterior',
    spine: 'Lower back',
    traps: 'Traps',
    triceps: 'Triceps',
    'upper-back': 'Upper back',
  },
};

export function muscleLabel(muscle: Muscle): string {
  return MUSCLE_LABELS[currentLocale()][muscle];
}

/*
 * `equipment` y `category` no son enums en el contrato: son etiquetas descriptivas del
 * catálogo externo y una versión nueva puede añadir valores. Se traducen los doce y los
 * cuatro que publica el tag `v1.1.0`, verificados contra el CDN, y cualquier otro se pinta
 * legible en vez de romper la ficha.
 */
const EQUIPMENT_LABELS: Readonly<Record<Locale, Readonly<Record<string, string>>>> = {
  es: {
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
  },
  en: {
    bodyweight: 'Bodyweight',
    dumbbell: 'Dumbbell',
    cable: 'Cable',
    barbell: 'Barbell',
    lever: 'Lever machine',
    band: 'Resistance band',
    smith: 'Smith machine',
    kettlebell: 'Kettlebell',
    'ez-bar': 'EZ bar',
    sled: 'Sled / leg press',
    machine: 'Machine',
    other: 'Other',
  },
};

const CATEGORY_LABELS: Readonly<Record<Locale, Readonly<Record<string, string>>>> = {
  es: {
    strength: 'Fuerza',
    stretching: 'Estiramiento',
    cardio: 'Cardio',
    plyometrics: 'Pliometría',
  },
  en: {
    strength: 'Strength',
    stretching: 'Stretching',
    cardio: 'Cardio',
    plyometrics: 'Plyometrics',
  },
};

export function equipmentLabel(equipment: string): string {
  return EQUIPMENT_LABELS[currentLocale()][equipment] ?? humanize(equipment);
}

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[currentLocale()][category] ?? humanize(category);
}

/** "ez-bar" → "Ez bar": legible sin inventar una traducción que no existe. */
export function humanize(value: string): string {
  const spaced = value.replace(/[-_]+/g, ' ').trim();
  if (spaced === '') return value;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
