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
  /**
   * Ha activado «competir con amigos»: los demás pueden elegirle como rival y ver su semana y sus
   * marcas. Falso por defecto: la sesión guardada en el dispositivo es de antes de que existiera.
   */
  competes: z.boolean().default(false),
  createdAt: isoDatetimeSchema,
});

/**
 * Lo que el usuario puede cambiar de su perfil. El nombre solo cambia el saludo de la app: la
 * llave de acceso ya guardada en el móvil conserva la etiqueta con la que se creó.
 */
export const updateUserRequestSchema = z
  .object({
    displayName: displayNameSchema,
    locale: localeSchema,
    unitSystem: unitSystemSchema,
    competes: z.boolean(),
  })
  .partial();

export type User = z.infer<typeof userSchema>;
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;
