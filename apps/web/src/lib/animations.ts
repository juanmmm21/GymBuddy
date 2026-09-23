/**
 * Avisa cuando el elemento deje de animarse, para poder quitarlo del DOM solo después de que su
 * salida se haya visto. Devuelve la función que cancela el aviso.
 *
 * El aviso **nunca llega de forma síncrona**: quien lo pide lo hace desde un efecto, y llamarlo en
 * el acto sería cambiar el estado en mitad de ese efecto. Donde no hay animaciones que esperar
 * —jsdom, un navegador sin Web Animations, o alguien que pidió menos movimiento— llega en la
 * siguiente microtarea, así que la salida no se traga ningún fotograma que se pudiera ver.
 */
export function whenAnimationsEnd(element: Element | null, done: () => void): () => void {
  let cancelled = false;
  const finish = (): void => {
    if (!cancelled) done();
  };

  const animations = runningAnimations(element);
  if (animations.length === 0) {
    queueMicrotask(finish);
  } else {
    // `finished` rechaza si la animación se cancela (el elemento cambia de clase antes de acabar):
    // eso también es haber terminado, así que se espera a que se asienten todas, no a que salgan bien.
    void Promise.allSettled(animations.map((animation) => animation.finished)).then(finish);
  }

  return () => {
    cancelled = true;
  };
}

/**
 * Avisa cuando el navegador ya haya pintado un fotograma con lo que hay ahora en el DOM. Devuelve la
 * función que cancela el aviso.
 *
 * Son dos `requestAnimationFrame` y no uno: el primero corre **antes** del siguiente pintado, así
 * que solo el segundo llega con ese fotograma ya en pantalla. Sin `requestAnimationFrame` (jsdom sin
 * modo visual, un navegador antiguo) el aviso llega en la siguiente microtarea, nunca de forma
 * síncrona, por lo mismo que en `whenAnimationsEnd`.
 */
export function afterNextPaint(done: () => void): () => void {
  let cancelled = false;
  const finish = (): void => {
    if (!cancelled) done();
  };

  if (typeof requestAnimationFrame !== 'function') {
    queueMicrotask(finish);
    return () => {
      cancelled = true;
    };
  }

  let frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(finish);
  });
  return () => {
    cancelled = true;
    cancelAnimationFrame(frame);
  };
}

/** Las animaciones del elemento y de sus pseudoelementos, sin bajar a los hijos. */
function runningAnimations(element: Element | null): readonly Animation[] {
  if (element === null || typeof element.getAnimations !== 'function') return [];
  return element.getAnimations();
}
