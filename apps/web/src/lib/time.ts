const MILLISECONDS_PER_SECOND = 1000;

/**
 * Segundos completos transcurridos desde un instante del contrato. Nunca negativo: el
 * reloj del móvil y el del Worker no van sincronizados, y una serie registrada "dentro
 * de dos segundos" tiene que leerse como recién hecha, no como un cronómetro al revés.
 */
export function elapsedSecondsSince(iso: string, now: number): number {
  const started = Date.parse(iso);
  // Una fecha que no se puede leer no puede cronometrarse; el contrato ya la valida al
  // entrar, así que aquí solo queda no propagar un NaN a la pantalla.
  if (Number.isNaN(started)) return 0;

  return Math.max(0, Math.floor((now - started) / MILLISECONDS_PER_SECOND));
}

/**
 * Lo que duró algo con principio y final del contrato. Nulo cuando alguna de las dos
 * fechas no se puede leer: la pantalla la omite en vez de escribir un `NaN`.
 */
export function durationSecondsBetween(startIso: string, endIso: string): number | null {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;

  return Math.max(0, Math.floor((end - start) / MILLISECONDS_PER_SECOND));
}
