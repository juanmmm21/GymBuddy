import { z } from 'zod';
import { isoDatetimeSchema, localeSchema, resourceIdSchema, unitSystemSchema } from './common';

export const userSchema = z.object({
  id: resourceIdSchema,
  // Llega de Telegram y excede los 32 bits en cuentas nuevas, pero cabe de sobra en un entero seguro.
  telegramUserId: z.int().positive(),
  firstName: z.string().min(1),
  username: z.string().min(1).nullable(),
  photoUrl: z.url().nullable(),
  locale: localeSchema,
  unitSystem: unitSystemSchema,
  createdAt: isoDatetimeSchema,
});

/** Lo único que el usuario puede cambiar de su perfil: su nombre y su foto son de Telegram. */
export const updateUserRequestSchema = z
  .object({
    locale: localeSchema,
    unitSystem: unitSystemSchema,
  })
  .partial();

export type User = z.infer<typeof userSchema>;
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;
