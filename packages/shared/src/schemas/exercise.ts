import { z } from 'zod';
import { isMuscleInBodyPart } from '../domain/muscles';
import { bodyPartSchema, muscleSchema } from './catalog';
import { isoDatetimeSchema, resourceIdSchema, weightKilogramsSchema } from './common';
import { cardioDistanceMetersSchema, cardioDurationSecondsSchema } from './session';

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
 * La última serie efectiva de un ejercicio (sin calentamiento), tal cual se hizo. Es lo que
 * precarga el registro: Juan pidió que el peso propuesto sea el de la última vez y que no suba
 * solo; el peso habitual sigue existiendo para responder a «¿cuánto suelo levantar aquí?».
 */
export const lastSetSchema = z.object({
  weight: weightKilogramsSchema,
  reps: z.int().positive(),
  completedAt: isoDatetimeSchema,
});

/**
 * La última serie de cardio de un ejercicio (sin calentamiento), tal cual se hizo. Va aparte de
 * `lastSet` porque no se parecen en nada: precarga la duración y la distancia cuando se registra
 * cardio, igual que `lastSet` precarga el peso.
 */
export const lastCardioSetSchema = z.object({
  durationSeconds: cardioDurationSecondsSchema,
  distanceMeters: cardioDistanceMetersSchema.nullable(),
  completedAt: isoDatetimeSchema,
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
  /**
   * El equipamiento del catálogo («barbell», «dumbbell»…), o nulo en uno propio. Es texto y no un
   * enum por lo mismo que en el catálogo: una versión nueva puede traer etiquetas nuevas. La PWA lo
   * mira para dibujar los discos solo en los ejercicios con barra olímpica.
   */
  equipment: z.string().min(1).nullable(),
  notes: z.string().nullable(),
  /**
   * A un brazo (remo con mancuerna): el peso de las series es el de un brazo y el volumen cuenta los
   * dos lados. Falso por defecto: la instantánea del dispositivo guarda ejercicios leídos antes.
   */
  unilateral: z.boolean().default(false),
  workingWeight: workingWeightSchema.nullable(),
  lastSet: lastSetSchema.nullable(),
  // Nula por defecto: la instantánea del dispositivo guarda ejercicios leídos antes de que existiera.
  lastCardioSet: lastCardioSetSchema.nullable().default(null),
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
    unilateral: z.boolean().optional(),
  }),
  z
    .object({
      id: resourceIdSchema,
      origin: z.literal('custom'),
      name: trackedExerciseNameSchema,
      muscle: muscleSchema.nullish(),
      bodyPart: bodyPartSchema.nullish(),
      notes: z.string().max(500).nullish(),
      unilateral: z.boolean().optional(),
    })
    // Un músculo solo vive en una parte del cuerpo (`MUSCLE_BODY_PART`): «glúteos» en pecho
    // agruparía la ficha y el calendario donde no toca, y no hay forma de corregirlo después.
    .refine((request) => isMuscleInBodyPart(request.muscle, request.bodyPart), {
      message: 'El músculo no pertenece a esa parte del cuerpo',
      path: ['muscle'],
    }),
]);

/**
 * Lo que se puede cambiar de un ejercicio ya seguido. El nombre solo cuando es propio: el
 * de uno del catálogo viene del catálogo y en el idioma del usuario, así que renombrarlo
 * aquí no tendría dónde guardarse. El Worker lo rechaza mirando el origen de la ficha.
 *
 * `unilateral` sí vale para los dos: el catálogo no dice si un ejercicio se hace a un brazo.
 */
export const updateTrackedExerciseRequestSchema = z
  .object({
    name: trackedExerciseNameSchema,
    notes: z.string().max(500).nullable(),
    archived: z.boolean(),
    unilateral: z.boolean(),
  })
  .partial();

export type WorkingWeight = z.infer<typeof workingWeightSchema>;
export type LastSet = z.infer<typeof lastSetSchema>;
export type LastCardioSet = z.infer<typeof lastCardioSetSchema>;
export type TrackedExercise = z.infer<typeof trackedExerciseSchema>;
export type CreateTrackedExerciseRequest = z.infer<typeof createTrackedExerciseRequestSchema>;
export type UpdateTrackedExerciseRequest = z.infer<typeof updateTrackedExerciseRequestSchema>;
