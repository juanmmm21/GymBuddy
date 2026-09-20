import { useEffect, useState } from 'react';
import { countUpValue } from '../lib/count-up';
import { usePrefersReducedMotion } from './use-reduced-motion';

/** Una cuenta en marcha: de dónde sale, a dónde va y por dónde va ahora. */
interface CountUpRun {
  readonly from: number;
  readonly to: number;
  readonly value: number;
}

/**
 * El número que hay que pintar de una cifra que cuenta hasta `target`. Al montarse sale de cero;
 * si el valor cambia después, cuenta desde el que se estaba enseñando.
 *
 * Quien pide menos movimiento —y cualquier entorno sin `requestAnimationFrame`— recibe el valor
 * final desde el primer pintado: contar es un adorno, el número es el dato.
 */
export function useCountUp(target: number): number {
  const reduced = usePrefersReducedMotion();
  // Estado derivado durante el render, como en la transición entre pantallas y en las series
  // recién apuntadas: arrancar la cuenta en un efecto enseñaría antes la cifra ya puesta.
  const [run, setRun] = useState<CountUpRun>(() => startRun(0, target, reduced));
  if (run.to !== target) setRun(startRun(run.value, target, reduced));

  const { from, to } = run;
  useEffect(() => {
    if (from === to) return;

    let frame = 0;
    let startedAt: number | null = null;
    const step = (timestamp: number): void => {
      // El origen es el primer fotograma servido, no el instante del efecto: entre los dos cabe
      // un repintado largo, y la cuenta empezaría ya por la mitad.
      startedAt ??= timestamp;
      const value = countUpValue(from, to, timestamp - startedAt);
      // Una cuenta nueva mandaría ya sobre esta: se comprueba antes de pisarla.
      setRun((current) =>
        current.from === from && current.to === to ? { from, to, value } : current,
      );
      if (value !== to) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [from, to]);

  return run.value;
}

function startRun(from: number, to: number, reduced: boolean): CountUpRun {
  const counts = !reduced && from !== to && typeof requestAnimationFrame === 'function';
  return counts ? { from, to, value: from } : { from: to, to, value: to };
}
