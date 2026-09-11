import { z } from 'zod';
import { isoDatetimeSchema, localeSchema, resourceIdSchema, unitSystemSchema } from './common';

export const MAX_DISPLAY_NAME_LENGTH = 40;

/**
 * El nombre con el que la app saluda y con el que el móvil etiqueta la llave de acceso. Lo
 * elige cada uno al registrarse; no es un identificador y dos personas pueden llamarse igual.
 */
export const displayNameSchema = z.string().trim().min(1).max(MAX_DISPLAY_NAME_LENGTH);

export const userSchema = z.object({
  id: resourceIdSchema,
  displayName: displayNameSchema,
  locale: localeSchema,
  unitSystem: unitSystemSchema,
  createdAt: isoDatetimeSchema,
});

/** Las preferencias del perfil que el usuario puede cambiar. */
export const updateUserRequestSchema = z
  .object({
    locale: localeSchema,
    unitSystem: unitSystemSchema,
  })
  .partial();

export type User = z.infer<typeof userSchema>;
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;
