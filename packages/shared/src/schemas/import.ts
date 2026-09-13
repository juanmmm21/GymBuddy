import { z } from 'zod';
import {
  MAX_IMPORT_EXERCISES_PER_BATCH,
  MAX_IMPORT_ROUTINES_PER_BATCH,
  MAX_IMPORT_ROWS_PER_BATCH,
  MAX_IMPORT_SESSIONS_PER_BATCH,
  routineImportRows,
  sessionImportRows,
} from '../domain/import';
import { exportedExerciseSchema, exportedRoutineSchema, exportedSessionSchema } from './export';

/*
 * Las peticiones con las que la PWA sube una copia de seguridad a la cuenta con sesión. Reciben
 * las piezas del fichero tal cual (`exportedExerciseSchema` y compañía), porque es el fichero el
 * que se valida entero antes de empezar; aquí solo se añaden los topes de cada petición.
 */

/**
 * Ejercicios primero: las rutinas y las series los nombran. Un mismo ejercicio del catálogo no
 * puede venir dos veces en la misma petición, porque la base no deja seguirlo dos veces.
 */
export const importExercisesRequestSchema = z
  .object({
    exercises: z.array(exportedExerciseSchema).min(1).max(MAX_IMPORT_EXERCISES_PER_BATCH),
  })
  .refine(
    ({ exercises }) => {
      const catalogIds = exercises.flatMap((exercise) =>
        exercise.catalogId === null ? [] : [exercise.catalogId],
      );
      return new Set(catalogIds).size === catalogIds.length;
    },
    { message: 'Un ejercicio del catálogo aparece dos veces', path: ['exercises'] },
  );

/**
 * Lo que la cuenta de destino no pudo enlazar con su catálogo (no está sincronizado, o es otra
 * versión) y entró como ejercicio propio con el nombre del fichero, para no perder sus series.
 */
export const importExercisesResponseSchema = z.object({
  enteredAsCustom: z.array(z.string().min(1)),
});

export const importRoutinesRequestSchema = z
  .object({
    routines: z.array(exportedRoutineSchema).min(1).max(MAX_IMPORT_ROUTINES_PER_BATCH),
  })
  .refine(
    ({ routines }) =>
      routines.reduce((rows, routine) => rows + routineImportRows(routine), 0) <=
      MAX_IMPORT_ROWS_PER_BATCH,
    { message: 'Demasiadas filas para una sola petición', path: ['routines'] },
  );

export const importSessionsRequestSchema = z
  .object({
    sessions: z.array(exportedSessionSchema).min(1).max(MAX_IMPORT_SESSIONS_PER_BATCH),
  })
  .refine(
    ({ sessions }) =>
      sessions.reduce((rows, session) => rows + sessionImportRows(session), 0) <=
      MAX_IMPORT_ROWS_PER_BATCH,
    { message: 'Demasiadas filas para una sola petición', path: ['sessions'] },
  );

export type ImportExercisesRequest = z.infer<typeof importExercisesRequestSchema>;
export type ImportExercisesResponse = z.infer<typeof importExercisesResponseSchema>;
export type ImportRoutinesRequest = z.infer<typeof importRoutinesRequestSchema>;
export type ImportSessionsRequest = z.infer<typeof importSessionsRequestSchema>;
