import { bodyPartSchema, muscleSchema } from '@gymbuddy/shared';
import { z } from 'zod';

// El tag vive en `@gymbuddy/shared` porque la PWA también lo necesita; se reexporta para
// que el resto del Worker siga leyéndolo del módulo del origen.
export { CATALOG_BASE_URL, CATALOG_VERSION } from '@gymbuddy/shared';

/**
 * Un ejercicio tal y como lo publica el CDN. Esto describe lo que *entra*; el contrato de
 * lo que GymBuddy *expone* vive en `@gymbuddy/shared` y no tiene por qué coincidir: aquí
 * llega `file`, y un fichero por idioma, mientras que nuestra API sirve el idioma pedido.
 *
 * `muscle` y `bodyPart` se validan contra los enums de `@gymbuddy/shared`, verificados
 * contra este mismo CDN. Si el origen introdujese un valor nuevo, el ejercicio no entra
 * al snapshot: la navegación no sabría pintar una parte del cuerpo que no conoce.
 */
export const sourceExerciseSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  muscle: muscleSchema,
  bodyPart: bodyPartSchema,
  equipment: z.string().min(1),
  category: z.string().min(1),
  secondaryMuscles: z.array(muscleSchema),
  instructions: z.array(z.string().min(1)).min(1),
  file: z.string().min(1),
  gifUrl: z.url(),
});

/**
 * El sobre del fichero de un músculo (`/api/{lang}/muscles/{muscle}.json`). Los ejercicios
 * quedan sin validar a propósito: se validan de uno en uno al construir las filas, para que
 * un ejercicio con un campo inesperado se descarte solo y no tire el músculo entero.
 */
export const sourceMuscleFileSchema = z.object({
  muscle: muscleSchema,
  count: z.int().nonnegative(),
  exercises: z.array(z.unknown()),
});

/** El índice de músculos: `/api/{lang}/muscles.json`. */
export const sourceMuscleIndexSchema = z.array(
  z.object({
    muscle: muscleSchema,
    count: z.int().nonnegative(),
    endpoint: z.string().min(1),
  }),
);

export type SourceExercise = z.infer<typeof sourceExerciseSchema>;
export type SourceMuscleFile = z.infer<typeof sourceMuscleFileSchema>;
export type SourceMuscleIndex = z.infer<typeof sourceMuscleIndexSchema>;
