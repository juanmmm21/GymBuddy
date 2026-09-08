import type { ClaimSessionResponse, Session } from '@gymbuddy/shared';
import { ApiRequestError, ApiTransportError } from '../api/client';

export type ClaimOutcome =
  | { readonly status: 'ready'; readonly session: Session }
  /** El nonce caducó sin que nadie pulsara Start: hay que pedir otro enlace. */
  | { readonly status: 'expired' }
  /** El Worker rechazó el nonce: no existe, se canjeó ya o alguien lo ató antes. */
  | { readonly status: 'invalid' }
  | { readonly status: 'aborted' };

export interface ClaimBackoffOptions {
  readonly claim: () => Promise<ClaimSessionResponse>;
  /** Caducidad del nonce, tal como la devolvió `POST /auth/nonce`. */
  readonly expiresAt: string;
  readonly signal?: AbortSignal;
  /** Reloj y espera inyectables: los tests no pueden esperar segundos de verdad. */
  readonly now?: () => number;
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  readonly initialDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly backoffFactor?: number;
}

export const DEFAULT_INITIAL_DELAY_MS = 1000;
export const DEFAULT_MAX_DELAY_MS = 5000;
export const DEFAULT_BACKOFF_FACTOR = 1.5;

/**
 * Sondea `POST /auth/claim` hasta que el usuario pulse Start en Telegram. `pending` es
 * funcionamiento normal y no un error, así que se espera con backoff; un corte de red
 * también se espera, porque en un gimnasio es pasajero. Se rinde al caducar el nonce.
 */
export async function claimWithBackoff(options: ClaimBackoffOptions): Promise<ClaimOutcome> {
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? sleepFor;
  const maxDelay = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const factor = options.backoffFactor ?? DEFAULT_BACKOFF_FACTOR;
  const expiresAt = Date.parse(options.expiresAt);

  let delay = options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;

  while (now() < expiresAt) {
    if (options.signal?.aborted === true) return { status: 'aborted' };

    let response: ClaimSessionResponse;
    try {
      response = await options.claim();
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'nonce_invalid') {
        return { status: 'invalid' };
      }
      if (!(error instanceof ApiTransportError)) throw error;
      response = { status: 'pending' };
    }

    if (response.status === 'ready') return { status: 'ready', session: response.session };

    const remaining = expiresAt - now();
    if (remaining <= 0) break;

    try {
      await sleep(Math.min(delay, remaining), options.signal);
    } catch (error) {
      if (isAbortError(error)) return { status: 'aborted' };
      throw error;
    }
    delay = Math.min(maxDelay, Math.round(delay * factor));
  }

  return options.signal?.aborted === true ? { status: 'aborted' } : { status: 'expired' };
}

/** Espera cancelable: abortar la señal rechaza con un `AbortError`, como hace `fetch`. */
export function sleepFor(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort(): void {
      clearTimeout(timer);
      reject(abortError());
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function abortError(): Error {
  return new DOMException('La espera se canceló', 'AbortError');
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
