import { z } from 'zod';
import { isoDatetimeSchema } from './common';

/**
 * Tag del catálogo externo. Va anclado a propósito: la rama `main` del repo de origen
 * está en desarrollo activo y regenera `api/` por completo, así que apuntar a `@main`
 * es dejar que una regeneración aguas arriba rompa la app sin tocar nada aquí.
 * Es la única constante que hay que cambiar para subir de versión (ver ADR 0001), y vive
 * aquí porque la leen los dos lados: el Worker para sincronizar y la PWA para cachear
 * solo los GIFs de este tag.
 */
export const CATALOG_VERSION = 'v1.1.0';

/**
 * El repositorio del que salen los ejercicios y sus GIFs. No tiene licencia y sus animaciones
 * son de terceros (ADR 0001): se consumen por CDN y se acreditan donde se ven, así que el nombre
 * vive aquí, en una sola constante, y de ella salen tanto la URL del CDN como el crédito de la app.
 */
export const CATALOG_SOURCE_REPOSITORY = 'JahelCuadrado/ExerciseGymGifsDB';

/** Adónde lleva el crédito del catálogo dentro de la app. */
export const CATALOG_SOURCE_URL = `https://github.com/${CATALOG_SOURCE_REPOSITORY}`;

export const CATALOG_BASE_URL = `https://cdn.jsdelivr.net/gh/${CATALOG_SOURCE_REPOSITORY}@${CATALOG_VERSION}`;

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

/**
 * Un valor de `equipment` pedido como filtro. Sigue abierto como en la ficha, pero con la forma
 * de las etiquetas del tag («ez-bar», «bodyweight»): así un filtro nuevo del catálogo funciona
 * sin tocar el contrato, y un «%» o un texto libre no llegan nunca a la consulta.
 */
export const catalogEquipmentSchema = z
  .string()
  .max(40)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'El equipamiento es una etiqueta del catálogo');

/**
 * Filtros del catálogo, comunes a la búsqueda y a la página de una parte del cuerpo. Los dos son
 * opcionales y se suman: «polea» y «dorsales» a la vez son los ejercicios de dorsales con polea.
 */
export const catalogFiltersSchema = z.object({
  equipment: catalogEquipmentSchema.optional(),
  muscle: muscleSchema.optional(),
});

/**
 * Los filtros de la búsqueda, que abarca el catálogo entero y por eso deja elegir también la parte
 * del cuerpo («espalda», «pecho»). No van en `catalogFiltersSchema`: en la página de una parte, la
 * parte ya viene en la ruta y un segundo `bodyPart` en la consulta solo podría contradecirla.
 */
export const catalogSearchFiltersSchema = catalogFiltersSchema.extend({
  bodyPart: bodyPartSchema.optional(),
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
export type CatalogFilters = z.infer<typeof catalogFiltersSchema>;
export type CatalogSearchFilters = z.infer<typeof catalogSearchFiltersSchema>;
export type BodyPartSummary = z.infer<typeof bodyPartSummarySchema>;
export type CatalogExercisePage = z.infer<typeof catalogExercisePageSchema>;
export type CatalogSyncStatus = z.infer<typeof catalogSyncStatusSchema>;
export type CatalogSyncStep = z.infer<typeof catalogSyncStepSchema>;
