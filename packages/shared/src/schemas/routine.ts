import { z } from 'zod';
import { isoDatetimeSchema, resourceIdSchema } from './common';

/**
 * El nombre de una rutina, con el mismo tope al crearla y al renombrarla. Se recorta al
 * entrar: un nombre de solo espacios pasaría el mínimo y dejaría la lista sin título.
 */
export const routineNameSchema = z.string().trim().min(1).max(120);

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

/**
 * Un ejercicio dentro de la rutina tal y como lo manda el cliente. El identificador viaja
 * —como en el resto de escrituras— para que reenviar el alta no duplique la línea; el
 * `orderIndex` no, porque lo da la posición en la lista: la PWA reordena arrastrando.
 */
const routineItemInputSchema = routineItemSchema
  .omit({ orderIndex: true })
  // El rango invertido es la única forma de escribir una rutina imposible de cumplir.
  .refine((item) => item.targetRepsMax >= item.targetRepsMin, {
    message: 'El máximo de repeticiones no puede ser menor que el mínimo',
    path: ['targetRepsMax'],
  });

/** Tope de ejercicios por rutina. Treinta líneas ya son un entrenamiento imposible de hacer. */
export const MAX_ROUTINE_ITEMS = 30;

export const createRoutineRequestSchema = z.object({
  id: resourceIdSchema,
  name: routineNameSchema,
  description: z.string().max(1000).nullish(),
  items: z.array(routineItemInputSchema).max(MAX_ROUTINE_ITEMS),
});

/**
 * Lo que se puede cambiar de una rutina ya creada. `items` se reemplaza entero y no línea
 * a línea: el editor manda la lista tal y como quedó en pantalla, y así reordenar, quitar
 * y añadir son la misma escritura en vez de tres rutas que hay que aplicar en orden.
 */
export const updateRoutineRequestSchema = z
  .object({
    name: routineNameSchema,
    description: z.string().max(1000).nullable(),
    items: z.array(routineItemInputSchema).max(MAX_ROUTINE_ITEMS),
    archived: z.boolean(),
  })
  .partial();

export type RoutineItem = z.infer<typeof routineItemSchema>;
export type RoutineItemInput = z.infer<typeof routineItemInputSchema>;
export type Routine = z.infer<typeof routineSchema>;
export type CreateRoutineRequest = z.infer<typeof createRoutineRequestSchema>;
export type UpdateRoutineRequest = z.infer<typeof updateRoutineRequestSchema>;
