import { useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { cx } from '../lib/cx';
import { screenTransitionFor, type ScreenTransition as Direction } from './screen-transition';
import styles from './ScreenTransition.module.css';

const CLASS_BY_DIRECTION: Readonly<Record<Direction, string | undefined>> = {
  forward: styles.forward,
  backward: styles.backward,
  fade: styles.fade,
  // Sin clase no hay animación: la pantalla ya está donde tiene que estar.
  none: undefined,
};

/**
 * Anima la pantalla que entra en cada navegación. Solo se anima la que llega: la que se va
 * desaparece en el acto, que es lo que evita ver dos pantallas montadas a la vez y lo que mantiene
 * la app respondiendo al instante entre serie y serie.
 *
 * Se mira el `pathname` y no la URL entera a propósito: el buscador del catálogo escribe lo
 * tecleado en la parte de la consulta, y animar en cada letra sería un parpadeo constante.
 */
export function ScreenTransition({ children }: { readonly children: ReactNode }) {
  const { pathname } = useLocation();
  // Estado derivado durante el render, el patrón de React para reaccionar a un cambio de props sin
  // un efecto: en un `ref` la segunda pasada de `StrictMode` ya vería la ruta nueva y no habría
  // dirección que calcular.
  const [previous, setPrevious] = useState<{
    readonly path: string;
    readonly direction: Direction;
  }>(() => ({ path: pathname, direction: 'none' }));

  if (previous.path !== pathname) {
    setPrevious({ path: pathname, direction: screenTransitionFor(previous.path, pathname) });
  }

  return (
    <div
      // Remontar reinicia la animación: sin la clave, volver a la misma pantalla no se movería.
      key={pathname}
      className={cx(styles.screen, CLASS_BY_DIRECTION[previous.direction])}
      data-screen-transition={previous.direction}
    >
      {children}
    </div>
  );
}
