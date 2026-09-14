import type { SessionWithPendingWrites } from '../offline/overlay';

/** Lo que la barra de pestañas enseña en el centro: nada, o el atajo a la sesión en curso. */
export type SessionShortcut =
  { readonly kind: 'hidden' } | { readonly kind: 'live'; readonly startedAt: string };

/**
 * El atajo solo existe con una sesión abierta según quien entrena: la de `useOpenSession`, con la
 * cola encima y la regla de inactividad ya aplicada. Mientras se lee, o si no se puede leer, no se
 * enseña: a diferencia de Hoy, la barra no tiene las señales para suponer, y un botón que lleva a
 * una sesión que no existe abriría la pantalla de empezar sin que nadie lo haya pedido.
 */
export function sessionShortcutFor(open: SessionWithPendingWrites | undefined): SessionShortcut {
  const session = open?.session ?? null;
  return session === null || session.endedAt !== null
    ? { kind: 'hidden' }
    : { kind: 'live', startedAt: session.startedAt };
}
