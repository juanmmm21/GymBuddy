import { z } from 'zod';
import { MAX_RIVALS } from '../domain/competition';
import { isoDatetimeSchema, resourceIdSchema, weightKilogramsSchema } from './common';
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

/** Alguien contra quien se compite, aunque todavía no compartáis ningún ejercicio. */
export const competitorSchema = z.object({
  userId: resourceIdSchema,
  displayName: displayNameSchema,
});

export const competitionExerciseEntrySchema = z.object({
  userId: resourceIdSchema,
  displayName: displayNameSchema,
  isSelf: z.boolean(),
  maxWeight: weightKilogramsSchema,
});

/**
 * Un ejercicio del catálogo en el que quien mira y algún rival tienen marca. Lleva el nombre del
 * catálogo y no el que cada uno le haya puesto: es el único que significa lo mismo para todos.
 */
export const competitionExerciseSchema = z.object({
  catalogId: z.string().min(1),
  name: z.string().min(1),
  gifUrl: z.url(),
  // Del más pesado al más ligero.
  entries: z.array(competitionExerciseEntrySchema).min(2),
});

export const competitionSchema = z.object({
  generatedAt: isoDatetimeSchema,
  /** Los rivales elegidos que siguen compitiendo, por nombre. Sin ellos no hay competición. */
  rivals: z.array(competitorSchema).max(MAX_RIVALS),
  exercises: z.array(competitionExerciseSchema),
});

export type RivalCandidate = z.infer<typeof rivalCandidateSchema>;
export type RivalCandidates = z.infer<typeof rivalCandidatesSchema>;
export type SetRivalsRequest = z.infer<typeof setRivalsRequestSchema>;
export type Competitor = z.infer<typeof competitorSchema>;
export type CompetitionExerciseEntry = z.infer<typeof competitionExerciseEntrySchema>;
export type CompetitionExercise = z.infer<typeof competitionExerciseSchema>;
export type Competition = z.infer<typeof competitionSchema>;
