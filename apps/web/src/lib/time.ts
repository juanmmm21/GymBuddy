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
