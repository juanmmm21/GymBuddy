import { z } from 'zod';
import { isoDatetimeSchema, resourceIdSchema, weightKilogramsSchema } from './common';

/**
 * Los tres récords se miden en kilogramos: el peso de la serie, el 1RM estimado y el
 * volumen (peso × repeticiones). Compartir unidad evita un campo de tipo por cada uno.
 */
export const personalRecordKindSchema = z.enum(['max_weight', 'estimated_1rm', 'max_volume']);

export const personalRecordSchema = z.object({
  id: resourceIdSchema,
  trackedExerciseId: resourceIdSchema,
  kind: personalRecordKindSchema,
  value: weightKilogramsSchema,
  setEntryId: resourceIdSchema,
  achievedAt: isoDatetimeSchema,
});

export type PersonalRecordKind = z.infer<typeof personalRecordKindSchema>;
export type PersonalRecord = z.infer<typeof personalRecordSchema>;
