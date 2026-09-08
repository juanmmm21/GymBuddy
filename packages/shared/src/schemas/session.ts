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

/**
 * Lo que pinta una fila del historial. Lleva el recuento de series para no obligar a la
 * PWA a traerse el detalle de cada sesión solo para escribir "5 series" bajo la fecha.
 */
export const workoutSessionSummarySchema = workoutSessionSchema.extend({
  setCount: z.int().nonnegative(),
});

/**
 * Los identificadores de sesión y serie los genera el cliente, también sin red: la cola
 * offline reenvía la misma escritura hasta que entra, y repetirla no puede duplicar filas.
 */
export const startSessionRequestSchema = z.object({
  id: resourceIdSchema,
  source: entrySourceSchema,
  startedAt: isoDatetimeSchema.optional(),
  notes: z.string().max(1000).nullish(),
});

export const logSetRequestSchema = z.object({
  id: resourceIdSchema,
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

/**
 * La sesión en curso, o `null` si no hay ninguna. Va envuelta y no como 404 porque "hoy
 * no has empezado a entrenar" es el estado normal de la pantalla, no un error.
 */
export const activeSessionResponseSchema = z.object({
  session: workoutSessionDetailSchema.nullable(),
});

/** Una página del historial de sesiones, de la más reciente a la más antigua. */
export const workoutSessionPageSchema = z.object({
  items: z.array(workoutSessionSummarySchema),
  total: z.int().nonnegative(),
  limit: z.int().positive(),
  offset: z.int().nonnegative(),
});

export type SetEntry = z.infer<typeof setEntrySchema>;
export type WorkoutSession = z.infer<typeof workoutSessionSchema>;
export type WorkoutSessionDetail = z.infer<typeof workoutSessionDetailSchema>;
export type WorkoutSessionSummary = z.infer<typeof workoutSessionSummarySchema>;
export type WorkoutSessionPage = z.infer<typeof workoutSessionPageSchema>;
export type ActiveSessionResponse = z.infer<typeof activeSessionResponseSchema>;
export type StartSessionRequest = z.infer<typeof startSessionRequestSchema>;
export type LogSetRequest = z.infer<typeof logSetRequestSchema>;
export type EndSessionRequest = z.infer<typeof endSessionRequestSchema>;
