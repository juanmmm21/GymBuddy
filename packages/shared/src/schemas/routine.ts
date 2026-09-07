import { z } from 'zod';
import { isoDatetimeSchema, resourceIdSchema } from './common';

export const routineItemSchema = z.object({
  id: resourceIdSchema,
  trackedExerciseId: resourceIdSchema,
  orderIndex: z.int().nonnegative(),
  targetSets: z.int().positive().max(20),
  targetRepsMin: z.int().positive().max(100),
  targetRepsMax: z.int().positive().max(100),
});

export const routineSchema = z.object({
  id: resourceIdSchema,
  name: z.string().min(1),
  description: z.string().nullable(),
  createdAt: isoDatetimeSchema,
  archivedAt: isoDatetimeSchema.nullable(),
  items: z.array(routineItemSchema),
});

const routineItemInputSchema = routineItemSchema
  .omit({ id: true, orderIndex: true })
  // El rango invertido es la única forma de escribir una rutina imposible de cumplir.
  .refine((item) => item.targetRepsMax >= item.targetRepsMin, {
    message: 'El máximo de repeticiones no puede ser menor que el mínimo',
    path: ['targetRepsMax'],
  });

export const createRoutineRequestSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).nullish(),
  // El orden lo da la posición en la lista: la PWA reordena arrastrando, no editando índices.
  items: z.array(routineItemInputSchema).max(30),
});

export const updateRoutineRequestSchema = z
  .object({
    name: z.string().min(1).max(120),
    description: z.string().max(1000).nullable(),
    items: z.array(routineItemInputSchema).max(30),
    archived: z.boolean(),
  })
  .partial();

export type RoutineItem = z.infer<typeof routineItemSchema>;
export type Routine = z.infer<typeof routineSchema>;
export type CreateRoutineRequest = z.infer<typeof createRoutineRequestSchema>;
export type UpdateRoutineRequest = z.infer<typeof updateRoutineRequestSchema>;
