/**
 * Un reloj compartido que avanza a saltos fijos y se expone como store externo. Existe
 * para que un cronómetro repinte sin guardar el tiempo en el estado de React: el tiempo
 * no es estado de la app, es una lectura del reloj, y un `setState` dentro de un
 * `useEffect` no pasa el lint del compilador.
 */

export type Unsubscribe = () => void;

/**
 * Las dos operaciones van como propiedades y no como métodos: `useSyncExternalStore` las
 * recibe sueltas, sin su objeto, y un método declarado como tal no puede desligarse.
 */
export interface Ticker {
  /** Registra un oyente y arranca el reloj si estaba parado. */
  readonly subscribe: (listener: () => void) => Unsubscribe;
  /** El último instante emitido. Estable entre repintados: React lo exige. */
  readonly getSnapshot: () => number;
}

export function createTicker(intervalMs: number, now: () => number = Date.now): Ticker {
  const listeners = new Set<() => void>();
  let value = now();
  let timer: ReturnType<typeof setInterval> | null = null;

  const tick = (): void => {
    value = now();
    for (const listener of listeners) listener();
  };

  return {
    subscribe: (listener: () => void): Unsubscribe => {
      listeners.add(listener);
      if (timer === null) {
        // Mientras nadie mira el reloj está parado y su instantánea se quedó vieja: se
        // refresca al entrar el primer oyente para que el primer pintado no venga de antes.
        value = now();
        timer = setInterval(tick, intervalMs);
      }

      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && timer !== null) {
          clearInterval(timer);
          timer = null;
        }
      };
    },
    getSnapshot: () => value,
  };
}
