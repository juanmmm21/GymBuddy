import { MAX_CARDIO_DURATION_SECONDS } from '@gymbuddy/shared';

const SECONDS_PER_MINUTE = 60;

/** Lo que suben y bajan los botones: un minuto, que es como se piensa un cardio. */
export const DURATION_STEP_SECONDS = SECONDS_PER_MINUTE;

export type ParsedDuration =
  | { readonly kind: 'empty' }
  | { readonly kind: 'valid'; readonly seconds: number }
  | { readonly kind: 'invalid' };

/*
 * «30» son treinta minutos y «25:30», veinticinco y medio. En el gimnasio se apunta lo que marca la
 * cinta, que casi siempre es un número redondo de minutos: pedir los segundos en otro campo sería
 * teclear un cero de más en cada serie. La coma y el punto valen como los dos puntos porque el
 * teclado decimal del iPhone no los tiene; los segundos van siempre con dos cifras para que «12,5»
 * no se lea como doce minutos y cinco segundos cuando quería decir doce y medio.
 */
const DURATION_PATTERN = /^(?<minutes>\d{1,4})(?:[:.,](?<seconds>[0-5]\d))?(?:\s*min)?$/i;

/** Convierte lo tecleado en segundos enteros, dentro de lo que admite el contrato. */
export function parseDurationInput(text: string): ParsedDuration {
  const normalized = text.trim();
  if (normalized === '') return { kind: 'empty' };

  const groups = DURATION_PATTERN.exec(normalized)?.groups;
  if (groups?.minutes === undefined) return { kind: 'invalid' };

  const seconds =
    Number.parseInt(groups.minutes, 10) * SECONDS_PER_MINUTE +
    Number.parseInt(groups.seconds ?? '0', 10);
  if (seconds <= 0 || seconds > MAX_CARDIO_DURATION_SECONDS) return { kind: 'invalid' };

  return { kind: 'valid', seconds };
}

/** Lo que el campo enseña al editar: «30» si son minutos redondos y «25:30» si no. */
export function formatDurationForInput(seconds: number): string {
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  const rest = seconds % SECONDS_PER_MINUTE;

  return rest === 0 ? String(minutes) : `${String(minutes)}:${String(rest).padStart(2, '0')}`;
}

/**
 * Suma o resta un minuto sin bajar de uno ni pasar del tope. Bajar de un minuto dejaría la serie
 * en cero, que el contrato no admite: quien hizo menos lo teclea.
 */
export function stepDuration(seconds: number | null, delta: number): number {
  const next = (seconds ?? 0) + delta;

  return Math.min(MAX_CARDIO_DURATION_SECONDS, Math.max(SECONDS_PER_MINUTE, next));
}
