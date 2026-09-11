import type {
  AuthenticationCredential,
  LoginOptions,
  RegistrationCredential,
  RegistrationOptions,
} from '@gymbuddy/shared';
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';

/**
 * Por qué no salió la parte del navegador: `cancelled` agrupa cancelar, agotar el tiempo y no
 * tener ninguna llave, porque el navegador responde lo mismo a las tres a propósito (no revela
 * qué llaves hay) y quien está delante las arregla igual, volviendo a intentarlo.
 */
export type PasskeyCeremonyFailure = 'cancelled' | 'unsupported' | 'failed';

export class PasskeyCeremonyError extends Error {
  readonly reason: PasskeyCeremonyFailure;

  constructor(reason: PasskeyCeremonyFailure, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'PasskeyCeremonyError';
    this.reason = reason;
  }
}

/**
 * Lo que la entrada necesita del navegador. Es una interfaz, y no una llamada directa a
 * `@simplewebauthn/browser` desde la pantalla, para que los tests inyecten un autenticador falso:
 * jsdom no tiene WebAuthn.
 */
export interface PasskeyAuthenticator {
  readonly isSupported: () => boolean;
  readonly create: (options: RegistrationOptions) => Promise<RegistrationCredential>;
  readonly get: (options: LoginOptions) => Promise<AuthenticationCredential>;
}

export const browserPasskeyAuthenticator: PasskeyAuthenticator = {
  isSupported: () => browserSupportsWebAuthn(),
  create: (options) => runCeremony(() => startRegistration({ optionsJSON: options })),
  get: (options) => runCeremony(() => startAuthentication({ optionsJSON: options })),
};

async function runCeremony<T>(ceremony: () => Promise<T>): Promise<T> {
  try {
    return await ceremony();
  } catch (error) {
    throw toCeremonyError(error);
  }
}

/** Traduce lo que lanza el navegador a los tres motivos que la pantalla sabe explicar. */
export function toCeremonyError(error: unknown): PasskeyCeremonyError {
  if (error instanceof PasskeyCeremonyError) return error;

  // `@simplewebauthn/browser` conserva en `name` el de la excepción original del navegador.
  const name = errorName(error);
  if (name === 'NotAllowedError' || name === 'AbortError') {
    return new PasskeyCeremonyError('cancelled', 'La llave de acceso no se completó', {
      cause: error,
    });
  }
  if (name === 'NotSupportedError') {
    return new PasskeyCeremonyError('unsupported', 'El navegador no admite llaves de acceso', {
      cause: error,
    });
  }

  return new PasskeyCeremonyError('failed', 'El navegador no pudo usar la llave de acceso', {
    cause: error,
  });
}

/**
 * El `name` de lo que lanzó el navegador, sin exigir que sea un `Error`: los `DOMException` no
 * heredan de `Error` en todos los entornos (jsdom, entre otros) y ahí el motivo se perdía.
 */
function errorName(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('name' in error)) return '';

  const { name } = error as { readonly name: unknown };

  return typeof name === 'string' ? name : '';
}
