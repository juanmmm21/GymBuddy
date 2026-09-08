import type { CatalogExercisePage } from '@gymbuddy/shared';

/**
 * Desplazamiento de la página siguiente, o `undefined` cuando ya no queda nada. Una
 * página vacía corta la cadena aunque `total` diga otra cosa: si el snapshot cambia entre
 * dos peticiones, el recuento puede quedarse por delante de las filas, y seguir pidiendo
 * páginas vacías sería un bucle.
 */
export function nextPageOffset(page: CatalogExercisePage): number | undefined {
  if (page.items.length === 0) return undefined;
  const loaded = page.offset + page.items.length;
  return loaded < page.total ? loaded : undefined;
}
