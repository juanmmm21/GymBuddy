const MILLISECONDS_PER_SECOND = 1000;

/**
 * Lo que le queda de vida al código, en segundos y sin bajar de cero. Va aparte de la pantalla
 * porque es lo único que decide si el código todavía sirve, y así se prueba sin montar nada.
 */
export function secondsUntil(expiresAt: string, now: number): number {
  const remaining = Date.parse(expiresAt) - now;

  return remaining <= 0 ? 0 : Math.ceil(remaining / MILLISECONDS_PER_SECOND);
}
