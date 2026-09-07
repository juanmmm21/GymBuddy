import { z } from 'zod';
import { isoDatetimeSchema } from './common';

/**
 * Las siete partes del cuerpo por las que navega el usuario. No son los músculos:
 * el pecho es bodyPart "chest" y muscle "pectorals". Confundirlos rompe la navegación.
 */
export const bodyPartSchema = z.enum([
  'arms',
  'back',
  'cardio',
  'chest',
  'core',
  'legs',
  'shoulders',
]);

/** Los diecinueve músculos del catálogo; dan nombre a la carpeta del GIF y al `catalogId`. */
export const muscleSchema = z.enum([
  'abductors',
  'abs',
  'adductors',
  'biceps',
  'calves',
  'cardio',
  'delts',
  'forearms',
  'glutes',
  'hamstrings',
  'lats',
  'levator-scapulae',
  'pectorals',
  'quads',
  'serratus-anterior',
  'spine',
  'traps',
  'triceps',
  'upper-back',
]);

/**
 * `equipment` y `category` no se cierran en un enum: son etiquetas descriptivas del
 * catálogo externo y una versión nueva puede añadir valores sin avisar. Los estructurales
 * —los que deciden navegación y rutas— sí van cerrados.
 */
export const catalogExerciseSummarySchema = z.object({
  catalogId: z.string().min(1),
  name: z.string().min(1),
  muscle: muscleSchema,
  bodyPart: bodyPartSchema,
  equipment: z.string().min(1),
  gifUrl: z.url(),
});

export const catalogExerciseSchema = catalogExerciseSummarySchema.extend({
  category: z.string().min(1),
  secondaryMuscles: z.array(muscleSchema),
  instructions: z.array(z.string().min(1)),
  syncedAt: isoDatetimeSchema,
});

export const bodyPartSummarySchema = z.object({
  bodyPart: bodyPartSchema,
  exerciseCount: z.int().nonnegative(),
});

export type BodyPart = z.infer<typeof bodyPartSchema>;
export type Muscle = z.infer<typeof muscleSchema>;
export type CatalogExerciseSummary = z.infer<typeof catalogExerciseSummarySchema>;
export type CatalogExercise = z.infer<typeof catalogExerciseSchema>;
export type BodyPartSummary = z.infer<typeof bodyPartSummarySchema>;
