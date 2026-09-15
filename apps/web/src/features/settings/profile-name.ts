import { displayNameSchema } from '@gymbuddy/shared';

/**
 * El nombre que se mandaría al guardar, o `null` si no hay nada que guardar: vacío, demasiado
 * largo o igual al actual una vez recortado (cambiar solo espacios no es cambiar de nombre).
 */
export function displayNameToSave(draft: string, current: string): string | null {
  const parsed = displayNameSchema.safeParse(draft);
  if (!parsed.success || parsed.data === current) return null;

  return parsed.data;
}
