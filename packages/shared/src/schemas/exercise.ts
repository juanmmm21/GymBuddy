import { z } from 'zod';
import { bodyPartSchema, muscleSchema } from './catalog';
import { isoDatetimeSchema, resourceIdSchema, weightKilogramsSchema } from './common';

/**
 * La última serie efectiva registrada de un ejercicio. Es lo que precarga el peso al
 * añadir la siguiente: sin esto el usuario reescribe cada semana lo que ya levantó. El
 * calentamiento queda fuera a propósito, porque no representa lo que mueve de verdad.
 */
export const lastSetSchema = z.object({
  weight: weightKilogramsSchema,
  reps: z.int().positive(),
  completedAt: isoDatetimeSchema,
});

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
  lastSet: lastSetSchema.nullable(),
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
    name: z.string().min(1).max(120),
    muscle: muscleSchema.nullish(),
    bodyPart: bodyPartSchema.nullish(),
    notes: z.string().max(500).nullish(),
  }),
]);

export const updateTrackedExerciseRequestSchema = z
  .object({
    notes: z.string().max(500).nullable(),
    archived: z.boolean(),
  })
  .partial();

export type LastSet = z.infer<typeof lastSetSchema>;
export type TrackedExercise = z.infer<typeof trackedExerciseSchema>;
export type CreateTrackedExerciseRequest = z.infer<typeof createTrackedExerciseRequestSchema>;
export type UpdateTrackedExerciseRequest = z.infer<typeof updateTrackedExerciseRequestSchema>;
