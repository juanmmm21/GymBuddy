/**
 * La forma que comparten las páginas del contrato (el catálogo y el historial de
 * sesiones): qué trae esta página, cuántas filas hay en total y desde dónde empezó. Se
 * declara estructuralmente para no atar la paginación a un recurso concreto.
 */
export interface OffsetPage {
  readonly items: readonly unknown[];
  readonly total: number;
  readonly offset: number;
}

/**
 * Desplazamiento de la página siguiente, o `undefined` cuando ya no queda nada. Una
 * página vacía corta la cadena aunque `total` diga otra cosa: si el snapshot cambia entre
 * dos peticiones, el recuento puede quedarse por delante de las filas, y seguir pidiendo
 * páginas vacías sería un bucle.
 */
export function nextPageOffset(page: OffsetPage): number | undefined {
  if (page.items.length === 0) return undefined;
  const loaded = page.offset + page.items.length;
  return loaded < page.total ? loaded : undefined;
}
