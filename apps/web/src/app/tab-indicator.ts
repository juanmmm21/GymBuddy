import { TAB_PATHS } from './screen-transition';

export interface TabIndicator {
  /** Cuántos huecos tiene la barra: cuatro pestañas, o cinco con el botón de la sesión en medio. */
  readonly columns: number;
  /** El hueco sobre el que se pone la marca, o `null` si la pantalla actual no es una pestaña. */
  readonly index: number | null;
}

/**
 * Dónde se pone la marca que se desliza bajo la pestaña actual. Es pura y se decide solo con la
 * ruta y con si hay botón de sesión, que es lo que cambia el número de huecos: la marca no mide
 * nada del DOM, así que sigue cuadrando cuando la barra cambia de ancho.
 *
 * El botón de la sesión no lleva marca aunque sea la pantalla actual: ya se distingue él solo por
 * el color, y ponerle además una raya sería decir dos veces lo mismo.
 */
export function tabIndicatorFor(pathname: string, sessionShortcut: boolean): TabIndicator {
  const columnPaths = sessionShortcut ? COLUMNS_WITH_SESSION : COLUMNS;
  const index = columnPaths.findIndex(
    (path) => path !== TAB_PATHS.session && matchesTab(pathname, path),
  );
  return { columns: columnPaths.length, index: index === -1 ? null : index };
}

const COLUMNS: readonly string[] = [
  TAB_PATHS.home,
  TAB_PATHS.exercises,
  TAB_PATHS.catalog,
  TAB_PATHS.history,
];

const COLUMNS_WITH_SESSION: readonly string[] = [
  TAB_PATHS.home,
  TAB_PATHS.exercises,
  TAB_PATHS.session,
  TAB_PATHS.catalog,
  TAB_PATHS.history,
];

/**
 * La misma regla que marca de azul la pestaña: la raíz solo con la raíz, y las demás también con lo
 * que cuelga de ellas, para que la ficha de un ejercicio del catálogo siga siendo «Catálogo».
 */
function matchesTab(pathname: string, tabPath: string): boolean {
  const path = normalizePath(pathname);
  if (tabPath === TAB_PATHS.home) return path === TAB_PATHS.home;
  return path === tabPath || path.startsWith(`${tabPath}/`);
}

/** `/catalog/` y `/catalog` son la misma pantalla; la raíz se queda en `/`. */
function normalizePath(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}
