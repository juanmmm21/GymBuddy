/**
 * `available`: Chrome ofreció instalar y el diálogo se puede abrir. `installed`: se instaló en
 * esta visita. `unavailable`: cualquier otro caso (Safari, Firefox, ya se usó o ya instalada).
 */
export type InstallPromptState = 'unavailable' | 'available' | 'installed';

export type InstallPromptOutcome = 'accepted' | 'dismissed' | 'unavailable';

/**
 * El diálogo de instalación del navegador. Las funciones van como propiedades y no como métodos
 * porque `useSyncExternalStore` las recibe sueltas.
 */
export interface InstallPrompt {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getState: () => InstallPromptState;
  /** Abre el diálogo. Solo vale una vez por evento: luego el navegador lo da por gastado. */
  readonly prompt: () => Promise<InstallPromptOutcome>;
}

/** `BeforeInstallPromptEvent` no está en `lib.dom`: solo lo implementan los Chromium. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<unknown>;
  readonly userChoice: Promise<{ readonly outcome: 'accepted' | 'dismissed' }>;
}

function isBeforeInstallPromptEvent(event: Event): event is BeforeInstallPromptEvent {
  return (
    typeof (event as Partial<BeforeInstallPromptEvent>).prompt === 'function' &&
    'userChoice' in event
  );
}

/**
 * Empieza a escuchar el ofrecimiento de instalar. Tiene que llamarse antes de montar React:
 * Chrome lanza `beforeinstallprompt` una sola vez, pronto, y un listener que llegue tarde no lo ve.
 */
export function captureInstallPrompt(target: EventTarget): InstallPrompt {
  let deferred: BeforeInstallPromptEvent | null = null;
  let state: InstallPromptState = 'unavailable';
  const listeners = new Set<() => void>();

  const setState = (next: InstallPromptState): void => {
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener();
  };

  target.addEventListener('beforeinstallprompt', (event) => {
    if (!isBeforeInstallPromptEvent(event)) return;
    // Sin esto Chrome enseña su propia barra en cuanto quiere; el botón lo pone la pantalla guiada.
    event.preventDefault();
    deferred = event;
    if (state !== 'installed') setState('available');
  });

  target.addEventListener('appinstalled', () => {
    deferred = null;
    setState('installed');
  });

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getState: () => state,
    prompt: async () => {
      const event = deferred;
      if (event === null) return 'unavailable';
      // Se gasta antes de esperar: dos toques seguidos no pueden abrir el diálogo dos veces.
      deferred = null;
      setState('unavailable');

      try {
        await event.prompt();
        const choice = await event.userChoice;
        // `appinstalled` llega también, pero no siempre antes de que la pantalla quiera saberlo.
        if (choice.outcome === 'accepted') setState('installed');
        return choice.outcome;
      } catch (error) {
        console.warn('No se pudo abrir el diálogo de instalación', error);
        return 'unavailable';
      }
    },
  };
}

/** Para los navegadores sin diálogo y para los tests que no lo necesitan. */
export const unavailableInstallPrompt: InstallPrompt = {
  subscribe: () => () => undefined,
  getState: () => 'unavailable',
  prompt: () => Promise.resolve('unavailable'),
};
