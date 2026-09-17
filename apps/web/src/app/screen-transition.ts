import { SESSION_PATH } from '../features/session/paths';

/**
 * Cómo entra la pantalla nueva. `forward` y `backward` se deslizan desde el lado del que vienen;
 * `fade` aparece sin moverse, cuando las dos pantallas no guardan ninguna relación de orden; y
 * `none` es no animar nada (la primera pantalla de la app y quedarse donde ya se estaba).
 */
export type ScreenTransition = 'forward' | 'backward' | 'fade' | 'none';

/**
 * Las pestañas de abajo, de izquierda a derecha, con la sesión en el centro. Es la fuente del
 * orden: `TabShell` pinta la barra con estas mismas rutas, así que moverlas aquí mueve a la vez la
 * barra y hacia qué lado se desliza cada pantalla.
 */
export const TAB_PATHS = {
  home: '/',
  exercises: '/exercises',
  session: SESSION_PATH,
  catalog: '/catalog',
  history: '/history',
} as const;

const TAB_ORDER: readonly string[] = Object.values(TAB_PATHS);

/**
 * De qué lado entra la pantalla a la que se navega. Se decide solo con las dos rutas, sin mirar el
 * historial del navegador: bajar un nivel («Catálogo» → una parte del cuerpo → un ejercicio) va
 * hacia delante y subir va hacia atrás, y entre dos pestañas manda el orden de la barra, que es lo
 * que el pulgar acaba de hacer. Dos pantallas del mismo nivel sin orden entre ellas solo se funden.
 */
export function screenTransitionFor(
  previousPath: string | null,
  nextPath: string,
): ScreenTransition {
  if (previousPath === null) return 'none';

  const previous = normalizePath(previousPath);
  const next = normalizePath(nextPath);
  if (previous === next) return 'none';

  const previousDepth = depthOf(previous);
  const nextDepth = depthOf(next);
  if (nextDepth !== previousDepth) return nextDepth > previousDepth ? 'forward' : 'backward';

  const previousTab = TAB_ORDER.indexOf(previous);
  const nextTab = TAB_ORDER.indexOf(next);
  if (previousTab === -1 || nextTab === -1) return 'fade';

  return nextTab > previousTab ? 'forward' : 'backward';
}

/** Cuántos segmentos cuelgan de la raíz: `/catalog/chest` son dos. */
function depthOf(path: string): number {
  return path.split('/').filter((segment) => segment !== '').length;
}

/** `/catalog/` y `/catalog` son la misma pantalla; la raíz se queda en `/`. */
function normalizePath(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}
