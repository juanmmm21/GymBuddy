import { z } from 'zod';
import { personalRecordSchema } from './record';
import { isoDatetimeSchema, resourceIdSchema, rpeSchema, weightKilogramsSchema } from './common';

export const setEntrySchema = z.object({
  id: resourceIdSchema,
  trackedExerciseId: resourceIdSchema,
  orderIndex: z.int().nonnegative(),
  weight: weightKilogramsSchema,
  reps: z.int().positive(),
  rpe: rpeSchema.nullable(),
  isWarmup: z.boolean(),
  completedAt: isoDatetimeSchema,
});

export const workoutSessionSchema = z.object({
  id: resourceIdSchema,
  startedAt: isoDatetimeSchema,
  // Nulo mientras la sesión sigue abierta: es lo que la marca como "en curso".
  endedAt: isoDatetimeSchema.nullable(),
  notes: z.string().nullable(),
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
  // La cola offline registra series con retraso, así que el momento lo manda quien escribe.
  completedAt: isoDatetimeSchema.optional(),
});

/**
 * Corregir una serie ya registrada: se teclea entre series y con prisa, así que el peso
 * equivocado es cuestión de tiempo. Va parcial —solo lo que se toca— y deja fuera el
 * ejercicio: cambiarlo no es corregir la serie, es borrarla y registrar otra.
 */
export const updateSetRequestSchema = z
  .object({
    weight: weightKilogramsSchema,
    reps: z.int().positive().max(1000),
    // Nulo para quitar un RPE anotado por error, no solo para cambiarlo.
    rpe: rpeSchema.nullable(),
    isWarmup: z.boolean(),
  })
  .partial();

export const endSessionRequestSchema = z.object({
  endedAt: isoDatetimeSchema.optional(),
  notes: z.string().max(1000).nullish(),
});

/**
 * Lo que responden el registro y la corrección de una serie. Los récords que acaba de
 * romper viajan con ella para que la celebración salga en el momento, y no al abrir otra
 * pantalla; en un reenvío de la cola offline la lista llega vacía, porque la marca ya
 * estaba puesta. Al corregir puede venir vacía por lo contrario: la serie dejó de marcar.
 */
export const logSetResponseSchema = z.object({
  set: setEntrySchema,
  records: z.array(personalRecordSchema),
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
export type UpdateSetRequest = z.infer<typeof updateSetRequestSchema>;
export type LogSetResponse = z.infer<typeof logSetResponseSchema>;
export type EndSessionRequest = z.infer<typeof endSessionRequestSchema>;
