import { z } from 'zod';
import {
  entrySourceSchema,
  isoDatetimeSchema,
  resourceIdSchema,
  rpeSchema,
  weightKilogramsSchema,
} from './common';

export const setEntrySchema = z.object({
  id: resourceIdSchema,
  trackedExerciseId: resourceIdSchema,
  orderIndex: z.int().nonnegative(),
  weight: weightKilogramsSchema,
  reps: z.int().positive(),
  rpe: rpeSchema.nullable(),
  isWarmup: z.boolean(),
  completedAt: isoDatetimeSchema,
  source: entrySourceSchema,
});

export const workoutSessionSchema = z.object({
  id: resourceIdSchema,
  startedAt: isoDatetimeSchema,
  // Nulo mientras la sesión sigue abierta: es lo que la marca como "en curso".
  endedAt: isoDatetimeSchema.nullable(),
  notes: z.string().nullable(),
  source: entrySourceSchema,
});

export const workoutSessionDetailSchema = workoutSessionSchema.extend({
  sets: z.array(setEntrySchema),
});

export const startSessionRequestSchema = z.object({
  source: entrySourceSchema,
  startedAt: isoDatetimeSchema.optional(),
  notes: z.string().max(1000).nullish(),
});

export const logSetRequestSchema = z.object({
  trackedExerciseId: resourceIdSchema,
  weight: weightKilogramsSchema,
  reps: z.int().positive().max(1000),
  rpe: rpeSchema.nullish(),
  isWarmup: z.boolean().optional(),
  // El bot y la cola offline registran series con retraso, así que el momento lo manda quien escribe.
  completedAt: isoDatetimeSchema.optional(),
  source: entrySourceSchema,
});

export const endSessionRequestSchema = z.object({
  endedAt: isoDatetimeSchema.optional(),
  notes: z.string().max(1000).nullish(),
});

export type SetEntry = z.infer<typeof setEntrySchema>;
export type WorkoutSession = z.infer<typeof workoutSessionSchema>;
export type WorkoutSessionDetail = z.infer<typeof workoutSessionDetailSchema>;
export type StartSessionRequest = z.infer<typeof startSessionRequestSchema>;
export type LogSetRequest = z.infer<typeof logSetRequestSchema>;
export type EndSessionRequest = z.infer<typeof endSessionRequestSchema>;
