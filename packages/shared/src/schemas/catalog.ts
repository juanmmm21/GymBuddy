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

/**
 * Una página del catálogo. Un `bodyPart` como `legs` reúne varios cientos de ejercicios:
 * devolverlos de golpe castigaría el límite de filas leídas de D1 en cada visita a la
 * pantalla de navegación, y la PWA solo pinta los que caben en el móvil.
 */
export const catalogExercisePageSchema = z.object({
  items: z.array(catalogExerciseSummarySchema),
  total: z.int().nonnegative(),
  limit: z.int().positive(),
  offset: z.int().nonnegative(),
});

/**
 * Estado del snapshot local del catálogo. `nextMuscle` es el músculo que falta por
 * traer: mientras no sea `null`, el ciclo de sincronización sigue en marcha.
 */
export const catalogSyncStatusSchema = z.object({
  catalogVersion: z.string().min(1),
  startedAt: isoDatetimeSchema,
  updatedAt: isoDatetimeSchema,
  completedAt: isoDatetimeSchema.nullable(),
  nextMuscle: muscleSchema.nullable(),
  exerciseCount: z.int().nonnegative(),
});

/** Lo que devuelve una invocación de la sincronización: qué hizo este paso y cómo queda el ciclo. */
export const catalogSyncStepSchema = z.object({
  syncedMuscle: muscleSchema.nullable(),
  exercisesUpserted: z.int().nonnegative(),
  staleExercisesRemoved: z.int().nonnegative(),
  status: catalogSyncStatusSchema,
});

export type BodyPart = z.infer<typeof bodyPartSchema>;
export type Muscle = z.infer<typeof muscleSchema>;
export type CatalogExerciseSummary = z.infer<typeof catalogExerciseSummarySchema>;
export type CatalogExercise = z.infer<typeof catalogExerciseSchema>;
export type BodyPartSummary = z.infer<typeof bodyPartSummarySchema>;
export type CatalogExercisePage = z.infer<typeof catalogExercisePageSchema>;
export type CatalogSyncStatus = z.infer<typeof catalogSyncStatusSchema>;
export type CatalogSyncStep = z.infer<typeof catalogSyncStepSchema>;
