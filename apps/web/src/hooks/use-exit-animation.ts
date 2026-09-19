import { useEffect, useState, type RefObject } from 'react';
import { whenAnimationsEnd } from '../lib/animations';

export interface ExitAnimation {
  /** Si hay que pintarlo: sigue siendo `true` mientras se va. */
  readonly mounted: boolean;
  /** Si se está yendo, para darle la clase de salida. */
  readonly leaving: boolean;
}

/**
 * Mantiene algo pintado mientras termina de irse. Sin esto, React lo quita en el mismo commit en
 * que deja de hacer falta y no hay nada que animar: es justo lo que pasaba con las hojas, que
 * subían al abrirse y desaparecían de golpe al cerrarse.
 *
 * Quien lo use anima la entrada al montar y la salida con `leaving`, y quita el nodo cuando
 * `mounted` baje. El aviso de que ha terminado llega del propio elemento, así que la duración está
 * una sola vez en el CSS: aquí no se repite ningún número. El `ref` lo trae quien llama —y se lo
 * pone al nodo él mismo— porque un ref devuelto dentro de un objeto se lee como leído en el render.
 */
export function useExitAnimation<T extends HTMLElement>(
  present: boolean,
  ref: RefObject<T | null>,
): ExitAnimation {
  // Estado derivado durante el render, como en la transición entre pantallas: con un efecto, el
  // nodo se pintaría un fotograma fuera de sitio antes de que le llegara la clase de salida.
  const [mounted, setMounted] = useState(present);
  if (present && !mounted) setMounted(true);

  const leaving = mounted && !present;

  useEffect(() => {
    if (!leaving) return;
    return whenAnimationsEnd(ref.current, () => setMounted(false));
  }, [leaving, ref]);

  return { mounted, leaving };
}
