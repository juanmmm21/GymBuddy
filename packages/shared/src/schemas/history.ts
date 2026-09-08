import { z } from 'zod';
import { isoDatetimeSchema, resourceIdSchema } from './common';
import { setEntrySchema } from './session';

/**
 * Una sesión pasada vista desde un ejercicio concreto: solo sus series de ese ejercicio.
 * Es la forma que necesitan la gráfica de progresión y el "cuánto levanté la última vez".
 */
export const exerciseHistoryEntrySchema = z.object({
  sessionId: resourceIdSchema,
  startedAt: isoDatetimeSchema,
  endedAt: isoDatetimeSchema.nullable(),
  sets: z.array(setEntrySchema),
});

/**
 * El historial de un ejercicio se limita por número de sesiones y no por fechas: lo que
 * pide la pantalla es "las últimas N veces que hice esto", y así el coste en filas leídas
 * de D1 no crece con los años de historial.
 */
export const exerciseHistorySchema = z.object({
  trackedExerciseId: resourceIdSchema,
  sessions: z.array(exerciseHistoryEntrySchema),
});

export type ExerciseHistoryEntry = z.infer<typeof exerciseHistoryEntrySchema>;
export type ExerciseHistory = z.infer<typeof exerciseHistorySchema>;
