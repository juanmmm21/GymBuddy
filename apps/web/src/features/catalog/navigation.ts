import type { BodyPart, CatalogFilters, CatalogSearchFilters } from '@gymbuddy/shared';
import { z } from 'zod';
import type { BackLink } from '../../app/ScreenHeader';
import { applyCatalogFiltersToParams } from './filters';
import { BODY_PART_LABELS } from './labels';
import { CATALOG_PATH, bodyPartPath } from './paths';

/** El parámetro de la URL con el texto de la búsqueda del catálogo. */
export const SEARCH_QUERY_PARAM = 'q';

export const SEARCH_BACK_LABEL = 'Búsqueda';

/** Lo que una lista del catálogo deja en el estado de navegación al abrir una ficha. */
export interface CatalogBackState {
  readonly catalogBackTo: BackLink;
}

/** El texto tal cual se tecleó, espacios incluidos: se trocea al buscar, no al guardarlo. */
export function readSearchQuery(params: URLSearchParams): string {
  return params.get(SEARCH_QUERY_PARAM) ?? '';
}

/** Escribe el texto en la URL sin tocar los filtros; vacío, quita el parámetro. */
export function withSearchQuery(params: URLSearchParams, query: string): URLSearchParams {
  const next = new URLSearchParams(params);
  if (query === '') next.delete(SEARCH_QUERY_PARAM);
  else next.set(SEARCH_QUERY_PARAM, query);
  return next;
}

/** `/catalog?q=…&bodyPart=…`: la búsqueda con sus filtros, lista para volver a ella. */
export function catalogSearchPath(query: string, filters: CatalogSearchFilters): string {
  return withSearch(
    CATALOG_PATH,
    applyCatalogFiltersToParams(withSearchQuery(new URLSearchParams(), query), filters),
  );
}

export function searchBackLink(query: string, filters: CatalogSearchFilters): BackLink {
  return { to: catalogSearchPath(query, filters), label: SEARCH_BACK_LABEL };
}

/** La página de una parte del cuerpo con los filtros que tenía puestos. */
export function bodyPartBackLink(bodyPart: BodyPart, filters: CatalogFilters): BackLink {
  return {
    to: withSearch(
      bodyPartPath(bodyPart),
      applyCatalogFiltersToParams(new URLSearchParams(), filters),
    ),
    label: BODY_PART_LABELS[bodyPart],
  };
}

export function catalogBackState(backTo: BackLink): CatalogBackState {
  return { catalogBackTo: backTo };
}

/** Solo se vuelve a una pantalla del catálogo: nada de lo que viaje en el estado saca de él. */
function isCatalogLocation(to: string): boolean {
  return (
    to === CATALOG_PATH || to.startsWith(`${CATALOG_PATH}/`) || to.startsWith(`${CATALOG_PATH}?`)
  );
}

const catalogBackStateSchema = z.object({
  catalogBackTo: z.object({
    to: z.string().refine(isCatalogLocation),
    label: z.string().min(1),
  }),
});

/**
 * El enlace de vuelta que dejó la lista de la que se viene, o `null` si se llegó de otro sitio (un
 * enlace directo, «Mis ejercicios»). El estado del historial sobrevive a una recarga y a una versión
 * nueva de la app, así que se valida en vez de fiarse de su forma.
 */
export function readCatalogBackLink(state: unknown): BackLink | null {
  const parsed = catalogBackStateSchema.safeParse(state);
  return parsed.success ? parsed.data.catalogBackTo : null;
}

function withSearch(path: string, params: URLSearchParams): string {
  const search = params.toString();
  return search === '' ? path : `${path}?${search}`;
}
