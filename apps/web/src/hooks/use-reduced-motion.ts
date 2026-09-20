import { useSyncExternalStore } from 'react';

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Si el sistema pide menos movimiento. Lo que se anima con CSS ya lo neutraliza `global.css`; esto
 * hace falta para lo que se anima con JavaScript, como las cifras que cuentan hasta su valor.
 *
 * Sin `matchMedia` —jsdom, un navegador antiguo— se asume que **sí**, igual que `watchColorScheme`
 * asume el tema claro cuando no puede preguntar: una cifra que no cuenta se lee perfectamente, y
 * así nada depende de un fotograma que en ese entorno no existe.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function subscribe(listener: () => void): () => void {
  const query = reducedMotionQuery();
  if (query === null) return () => undefined;

  query.addEventListener('change', listener);
  return () => {
    query.removeEventListener('change', listener);
  };
}

function getSnapshot(): boolean {
  return reducedMotionQuery()?.matches ?? true;
}

// La consulta se pide cada vez y no se guarda: cachearla dejaría fija la primera respuesta, y
// entonces un test que instala su `matchMedia` después de importar este módulo no la vería.
function reducedMotionQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(REDUCED_MOTION_QUERY);
}
