import { z } from 'zod';
import { personalRecordSchema } from './record';
import { isoDatetimeSchema, resourceIdSchema, rpeSchema, weightKilogramsSchema } from './common';

/**
 * Qué mide una serie. La de fuerza es peso por repeticiones; la de cardio, tiempo y, si se
 * sabe, distancia. No se deduce del ejercicio: un ejercicio propio puede no tener parte del
 * cuerpo, y la serie tiene que saber qué es por sí sola para no pedirle kilos a una cinta.
 */
export const setKindSchema = z.enum(['strength', 'cardio']);

/** Un día entero. Más que eso no es una serie de cardio, es un reloj que se quedó en marcha. */
export const MAX_CARDIO_DURATION_SECONDS = 86_400;

/** Quinientos kilómetros: cabe una ruta en bici de un día y no un error de tres ceros. */
export const MAX_CARDIO_DISTANCE_METERS = 500_000;

/** Segundos enteros: igual que el peso en gramos, nada de minutos en coma flotante. */
export const cardioDurationSecondsSchema = z.int().positive().max(MAX_CARDIO_DURATION_SECONDS);

/** Metros enteros; la pantalla los lee en kilómetros sin pasar por coma flotante. */
export const cardioDistanceMetersSchema = z.int().positive().max(MAX_CARDIO_DISTANCE_METERS);

const setEntryBaseSchema = z.object({
  id: resourceIdSchema,
  trackedExerciseId: resourceIdSchema,
  orderIndex: z.int().nonnegative(),
  rpe: rpeSchema.nullable(),
  isWarmup: z.boolean(),
  completedAt: isoDatetimeSchema,
});

export const strengthSetEntrySchema = setEntryBaseSchema.extend({
  kind: z.literal('strength'),
  weight: weightKilogramsSchema,
  reps: z.int().positive(),
});

export const cardioSetEntrySchema = setEntryBaseSchema.extend({
  kind: z.literal('cardio'),
  durationSeconds: cardioDurationSecondsSchema,
  distanceMeters: cardioDistanceMetersSchema.nullable(),
});

export const setEntrySchema = z.discriminatedUnion('kind', [
  strengthSetEntrySchema,
  cardioSetEntrySchema,
]);

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

const logSetRequestBaseSchema = z.object({
  id: resourceIdSchema,
  trackedExerciseId: resourceIdSchema,
  rpe: rpeSchema.nullish(),
  isWarmup: z.boolean().optional(),
  // La cola offline registra series con retraso, así que el momento lo manda quien escribe.
  completedAt: isoDatetimeSchema.optional(),
});

/**
 * `kind` es opcional y vale fuerza por defecto: la cola offline guarda en el móvil cuerpos
 * escritos antes de que existiera el cardio, y una PWA vieja en caché sigue mandándolos así.
 */
export const logStrengthSetRequestSchema = logSetRequestBaseSchema.extend({
  kind: z.literal('strength').default('strength'),
  weight: weightKilogramsSchema,
  reps: z.int().positive().max(1000),
});

export const logCardioSetRequestSchema = logSetRequestBaseSchema.extend({
  kind: z.literal('cardio'),
  durationSeconds: cardioDurationSecondsSchema,
  distanceMeters: cardioDistanceMetersSchema.nullish(),
});

/*
 * Una unión simple y no discriminada: la de Zod exige que el discriminante venga siempre, y
 * el de fuerza puede faltar. Las dos formas no se solapan —una pide peso y la otra duración—,
 * así que el orden no cambia lo que casa.
 */
export const logSetRequestSchema = z.union([
  logStrengthSetRequestSchema,
  logCardioSetRequestSchema,
]);

/**
 * Corregir una serie ya registrada: se teclea entre series y con prisa, así que el peso
 * equivocado es cuestión de tiempo. Va parcial —solo lo que se toca— y deja fuera el
 * ejercicio y el tipo: cambiarlos no es corregir la serie, es borrarla y registrar otra.
 * Por eso trae los campos de los dos tipos y el Worker rechaza los que no son del de la
 * serie guardada, que es algo que el esquema no puede saber.
 */
export const updateSetRequestSchema = z
  .object({
    weight: weightKilogramsSchema,
    reps: z.int().positive().max(1000),
    durationSeconds: cardioDurationSecondsSchema,
    // Nula para quitar una distancia anotada por error.
    distanceMeters: cardioDistanceMetersSchema.nullable(),
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

export type SetKind = z.infer<typeof setKindSchema>;
export type SetEntry = z.infer<typeof setEntrySchema>;
export type StrengthSetEntry = z.infer<typeof strengthSetEntrySchema>;
export type CardioSetEntry = z.infer<typeof cardioSetEntrySchema>;
export type WorkoutSession = z.infer<typeof workoutSessionSchema>;
export type WorkoutSessionDetail = z.infer<typeof workoutSessionDetailSchema>;
export type WorkoutSessionSummary = z.infer<typeof workoutSessionSummarySchema>;
export type WorkoutSessionPage = z.infer<typeof workoutSessionPageSchema>;
export type ActiveSessionResponse = z.infer<typeof activeSessionResponseSchema>;
export type StartSessionRequest = z.infer<typeof startSessionRequestSchema>;
export type LogSetRequest = z.infer<typeof logSetRequestSchema>;
export type LogStrengthSetRequest = z.infer<typeof logStrengthSetRequestSchema>;
export type LogCardioSetRequest = z.infer<typeof logCardioSetRequestSchema>;
export type UpdateSetRequest = z.infer<typeof updateSetRequestSchema>;
export type LogSetResponse = z.infer<typeof logSetResponseSchema>;
export type EndSessionRequest = z.infer<typeof endSessionRequestSchema>;
