import { z } from 'zod';
import { bodyPartSchema, muscleSchema } from './catalog';
import { isoDatetimeSchema, resourceIdSchema, weightKilogramsSchema } from './common';

/**
 * El peso habitual de un ejercicio: la mediana del peso de la serie efectiva más pesada de
 * las últimas cinco sesiones. Es la respuesta a "¿cuánto suelo levantar aquí?" y lo que
 * precarga el formulario, y es una mediana y no la última serie porque un día malo o una
 * sesión suelta de prueba no deben mover lo que la pantalla propone la próxima vez.
 */
export const workingWeightSchema = z.object({
  weight: weightKilogramsSchema,
  /** Las repeticiones de la última vez: el peso dice cuánto, esto dice cuántas. */
  reps: z.int().positive(),
  lastPerformedAt: isoDatetimeSchema,
  /** Sobre cuántas sesiones se calculó. Con una sola, el peso habitual es solo un dato. */
  sessionCount: z.int().positive(),
});

/**
 * El nombre de un ejercicio propio, con el mismo tope al crearlo y al renombrarlo: es el
 * mismo campo y una definición por sitio acabaría divergiendo. Se recorta al entrar
 * porque un nombre de solo espacios pasaría el mínimo y dejaría la ficha sin título.
 */
export const trackedExerciseNameSchema = z.string().trim().min(1).max(120);

/**
 * Un ejercicio seguido por el usuario viene del catálogo o es suyo. Se refleja como unión
 * discriminada porque es la misma restricción que impone la tabla: o hay catálogo, o hay nombre.
 */
export const trackedExerciseSchema = z.object({
  id: resourceIdSchema,
  // Ya resuelto: el del catálogo en el idioma del usuario, o el que él escribió.
  name: z.string().min(1),
  origin: z.enum(['catalog', 'custom']),
  catalogId: z.string().min(1).nullable(),
  muscle: muscleSchema.nullable(),
  bodyPart: bodyPartSchema.nullable(),
  gifUrl: z.url().nullable(),
  notes: z.string().nullable(),
  workingWeight: workingWeightSchema.nullable(),
  createdAt: isoDatetimeSchema,
  archivedAt: isoDatetimeSchema.nullable(),
});

/**
 * El identificador lo manda el cliente —también sin red— para que reenviar el alta no
 * cree dos fichas del mismo ejercicio. Es la misma regla que en sesiones y series.
 */
export const createTrackedExerciseRequestSchema = z.discriminatedUnion('origin', [
  z.object({
    id: resourceIdSchema,
    origin: z.literal('catalog'),
    catalogId: z.string().min(1),
    notes: z.string().max(500).nullish(),
  }),
  z.object({
    id: resourceIdSchema,
    origin: z.literal('custom'),
    name: trackedExerciseNameSchema,
    muscle: muscleSchema.nullish(),
    bodyPart: bodyPartSchema.nullish(),
    notes: z.string().max(500).nullish(),
  }),
]);

/**
 * Lo que se puede cambiar de un ejercicio ya seguido. El nombre solo cuando es propio: el
 * de uno del catálogo viene del catálogo y en el idioma del usuario, así que renombrarlo
 * aquí no tendría dónde guardarse. El Worker lo rechaza mirando el origen de la ficha.
 */
export const updateTrackedExerciseRequestSchema = z
  .object({
    name: trackedExerciseNameSchema,
    notes: z.string().max(500).nullable(),
    archived: z.boolean(),
  })
  .partial();

export type WorkingWeight = z.infer<typeof workingWeightSchema>;
export type TrackedExercise = z.infer<typeof trackedExerciseSchema>;
export type CreateTrackedExerciseRequest = z.infer<typeof createTrackedExerciseRequestSchema>;
export type UpdateTrackedExerciseRequest = z.infer<typeof updateTrackedExerciseRequestSchema>;
