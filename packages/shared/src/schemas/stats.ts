import { z } from 'zod';
import {
  isoDatetimeSchema,
  resourceIdSchema,
  volumeKilogramsSchema,
  weightKilogramsSchema,
} from './common';
import { workingWeightSchema } from './exercise';
import { personalRecordSchema } from './record';

/**
 * Un punto de la gráfica de progresión: una sesión resumida a lo que se pinta de ella.
 * Llega ya calculado del Worker en vez de dejar que la PWA sume series, porque el mismo
 * número tiene que salir igual en la gráfica, en el bot y en la mascota.
 */
export const progressionPointSchema = z.object({
  sessionId: resourceIdSchema,
  startedAt: isoDatetimeSchema,
  topWeight: weightKilogramsSchema,
  topReps: z.int().positive(),
  estimatedOneRepMax: weightKilogramsSchema,
  volume: volumeKilogramsSchema,
  totalReps: z.int().positive(),
  setCount: z.int().positive(),
});

/**
 * Un ejercicio atascado en el mismo peso durante varias sesiones seguidas sin perder
 * repeticiones. Va con el incremento sugerido ya resuelto, y solo con el identificador del
 * ejercicio: el nombre lo tiene la PWA en su lista y traerlo aquí obligaría a otro join.
 */
export const stalledExerciseSchema = z.object({
  trackedExerciseId: resourceIdSchema,
  weight: weightKilogramsSchema,
  sessions: z.int().positive(),
  suggestedIncrement: weightKilogramsSchema,
});

/** Todo lo que la pantalla de un ejercicio sabe decir sobre cómo va ese ejercicio. */
export const exerciseStatsSchema = z.object({
  trackedExerciseId: resourceIdSchema,
  workingWeight: workingWeightSchema.nullable(),
  /** Las marcas vigentes, una por tipo como mucho. Vacío mientras no haya ninguna serie. */
  records: z.array(personalRecordSchema),
  /** De la sesión más antigua a la más reciente, que es como se lee un eje temporal. */
  points: z.array(progressionPointSchema),
  stalled: stalledExerciseSchema.nullable(),
});

/**
 * Las señales que alimentan la mascota (fase 11) y la pantalla de inicio. Son de todo el
 * usuario, no de un ejercicio: el estancamiento viaja aquí como lista porque la mascota
 * tiene que poder sugerir subir peso sin que el usuario abra ese ejercicio.
 */
export const trainingSignalsSchema = z.object({
  generatedAt: isoDatetimeSchema,
  lastSessionAt: isoDatetimeSchema.nullable(),
  /** Días completos, o `null` si todavía no ha entrenado nunca: no es lo mismo que cero. */
  daysSinceLastSession: z.int().nonnegative().nullable(),
  weeklyStreak: z.int().nonnegative(),
  sessionsThisWeek: z.int().nonnegative(),
  /** La sesión sin cerrar, si la hay: es lo que pone a la mascota en modo descanso. */
  activeSessionId: resourceIdSchema.nullable(),
  latestRecord: personalRecordSchema.nullable(),
  stalled: z.array(stalledExerciseSchema),
});

export type ProgressionPointView = z.infer<typeof progressionPointSchema>;
export type StalledExercise = z.infer<typeof stalledExerciseSchema>;
export type ExerciseStats = z.infer<typeof exerciseStatsSchema>;
export type TrainingSignals = z.infer<typeof trainingSignalsSchema>;
