import { ApiException } from '../http/errors';

export const RELYING_PARTY_NAME = 'GymBuddy';

export interface RelyingParty {
  /** El dominio al que quedan atadas las passkeys (`rpID`). */
  readonly id: string;
  /** El origen exacto desde el que la PWA las crea y las usa. */
  readonly origin: string;
  readonly name: string;
}

/** Las vars de `wrangler.toml` de las que sale la configuración. */
export interface RelyingPartyVars {
  readonly WEBAUTHN_RP_ID: string;
  readonly WEBAUTHN_ORIGIN: string;
}

/**
 * Lee el dominio y el origen y comprueba que casan: el `rpID` tiene que ser el host del origen o
 * un dominio padre suyo, o ningún navegador creará la llave. Un despliegue con esto mal no puede
 * verificar ninguna passkey, y eso es un fallo nuestro (500), no de quien intenta entrar.
 */
export function readRelyingParty(vars: RelyingPartyVars): RelyingParty {
  const id = vars.WEBAUTHN_RP_ID.trim();
  const origin = vars.WEBAUTHN_ORIGIN.trim();

  if (id === '' || !originBelongsTo(origin, id)) {
    console.error('WEBAUTHN_RP_ID y WEBAUTHN_ORIGIN no casan', { id, origin });
    throw new ApiException('internal_error', 'El servidor no tiene bien configuradas las passkeys');
  }

  return { id, origin, name: RELYING_PARTY_NAME };
}

function originBelongsTo(origin: string, rpId: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch (error) {
    console.error('WEBAUTHN_ORIGIN no es una URL', error);
    return false;
  }

  // Un origen es esquema, host y puerto: con una ruta o una barra final no coincidiría nunca
  // con el que manda el navegador en `clientDataJSON`.
  return url.origin === origin && (url.hostname === rpId || url.hostname.endsWith(`.${rpId}`));
}
