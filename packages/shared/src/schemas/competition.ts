import { z } from 'zod';
import { MAX_RIVALS } from '../domain/competition';
import { DAYS_PER_WEEK } from '../domain/week';
import {
  isoDatetimeSchema,
  resourceIdSchema,
  volumeKilogramsSchema,
  weightKilogramsSchema,
} from './common';
import { displayNameSchema } from './user';

/**
 * Alguien a quien se puede elegir como rival. Solo sale quien ha activado «competir con amigos»
 * en sus ajustes; la cuenta de administración ve a todos, y `competes` le dice quién no lo ha
 * activado todavía.
 */
export const rivalCandidateSchema = z.object({
  userId: resourceIdSchema,
  displayName: displayNameSchema,
  competes: z.boolean(),
  selected: z.boolean(),
});

export const rivalCandidatesSchema = z.object({
  candidates: z.array(rivalCandidateSchema),
});

/**
 * La lista entera de rivales, no un cambio suelto: lo que llega sustituye a lo que había, así que
 * repetir la petición deja lo mismo.
 */
export const setRivalsRequestSchema = z.object({
  rivalIds: z
    .array(resourceIdSchema)
    .max(MAX_RIVALS)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'Un rival no puede ir dos veces',
    }),
});

/** Lo que lleva una persona en la semana en curso, ya con su puesto. */
export const competitionWeekStandingSchema = z.object({
  userId: resourceIdSchema,
  displayName: displayNameSchema,
  isSelf: z.boolean(),
  // Quien empata comparte puesto y el siguiente se lo salta (1, 1, 3).
  rank: z.int().positive(),
  daysTrained: z.int().min(0).max(DAYS_PER_WEEK),
  setCount: z.int().nonnegative(),
  volume: volumeKilogramsSchema,
});

export const competitionExerciseEntrySchema = z.object({
  userId: resourceIdSchema,
  displayName: displayNameSchema,
  isSelf: z.boolean(),
  maxWeight: weightKilogramsSchema,
  estimatedOneRepMax: weightKilogramsSchema,
});

/**
 * Un ejercicio del catálogo en el que quien mira y algún rival tienen marca. Lleva el nombre del
 * catálogo y no el que cada uno le haya puesto: es el único que significa lo mismo para todos.
 */
export const competitionExerciseSchema = z.object({
  catalogId: z.string().min(1),
  name: z.string().min(1),
  gifUrl: z.url(),
  // De mejor a peor 1RM estimado.
  entries: z.array(competitionExerciseEntrySchema).min(2),
});

export const competitionSchema = z.object({
  generatedAt: isoDatetimeSchema,
  /** El lunes de la semana que se compara, en UTC como el calendario de Hoy. */
  weekStart: z.iso.date(),
  /** Siempre trae a quien mira; con rivales, también a ellos, ya ordenados. */
  week: z.array(competitionWeekStandingSchema).min(1),
  exercises: z.array(competitionExerciseSchema),
});

export type RivalCandidate = z.infer<typeof rivalCandidateSchema>;
export type RivalCandidates = z.infer<typeof rivalCandidatesSchema>;
export type SetRivalsRequest = z.infer<typeof setRivalsRequestSchema>;
export type CompetitionWeekStanding = z.infer<typeof competitionWeekStandingSchema>;
export type CompetitionExerciseEntry = z.infer<typeof competitionExerciseEntrySchema>;
export type CompetitionExercise = z.infer<typeof competitionExerciseSchema>;
export type Competition = z.infer<typeof competitionSchema>;
