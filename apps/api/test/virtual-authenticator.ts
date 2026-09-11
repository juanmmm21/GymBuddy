import type {
  AuthenticationCredential,
  LoginOptions,
  RegistrationCredential,
  RegistrationOptions,
} from '@gymbuddy/shared';

/*
 * Un autenticador de mentira para probar las passkeys sin navegador ni red. Genera una clave
 * ES256 con WebCrypto y arma a mano lo que mandaría un móvil: `authenticatorData`, un
 * `attestationObject` con `fmt: "none"` en CBOR y la firma de la entrada en DER. Si el Worker
 * acepta esto, acepta el formato real; y cada pieza se puede estropear por separado.
 */

const FLAG_USER_PRESENT = 0x01;
const FLAG_USER_VERIFIED = 0x04;
const FLAG_BACKUP_ELIGIBLE = 0x08;
const FLAG_BACKED_UP = 0x10;
const FLAG_ATTESTED_DATA = 0x40;

/** El origen de la PWA en `wrangler.toml`, que es el que usan los tests. */
export const TEST_ORIGIN = 'http://localhost:5173';

export interface VirtualPasskey {
  readonly credentialId: string;
  readonly keyPair: CryptoKeyPair;
  /** El `user.id` de las opciones de registro: lo que el móvil devuelve al entrar. */
  readonly userHandle: string;
}

export interface CeremonyTweaks {
  readonly origin?: string;
  readonly rpId?: string;
  readonly userVerified?: boolean;
  readonly challenge?: string;
  readonly counter?: number;
}

export interface AssertionTweaks extends CeremonyTweaks {
  readonly userHandle?: string;
  /** Firma con otra clave, como haría quien copia el identificador de una credencial ajena. */
  readonly signingKey?: CryptoKey;
}

export interface CreatedPasskey {
  readonly credential: RegistrationCredential;
  readonly passkey: VirtualPasskey;
}

/** Crea una passkey para las opciones de registro, como `navigator.credentials.create`. */
export async function createPasskey(
  options: RegistrationOptions,
  tweaks: CeremonyTweaks = {},
): Promise<CreatedPasskey> {
  const keyPair = await generateKeyPair();
  const credentialId = crypto.getRandomValues(new Uint8Array(16));

  const jwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  if (jwk instanceof ArrayBuffer || jwk.x === undefined || jwk.y === undefined) {
    throw new Error('WebCrypto no exportó la clave pública como JWK de curva elíptica');
  }

  // Clave COSE EC2: kty 2, alg -7 (ES256), crv 1 (P-256) y las dos coordenadas.
  const coseKey = encodeCbor(
    new Map<CborValue, CborValue>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, fromBase64Url(jwk.x)],
      [-3, fromBase64Url(jwk.y)],
    ]),
  );

  const authenticatorData = concat([
    await rpIdHash(tweaks.rpId ?? options.rp.id),
    new Uint8Array([flags(tweaks.userVerified ?? true) | FLAG_ATTESTED_DATA]),
    counterBytes(tweaks.counter ?? 0),
    // AAGUID a ceros: con `attestation: "none"` no dice nada del autenticador.
    new Uint8Array(16),
    new Uint8Array([credentialId.length >> 8, credentialId.length & 0xff]),
    credentialId,
    coseKey,
  ]);

  const attestationObject = encodeCbor(
    new Map<CborValue, CborValue>([
      ['fmt', 'none'],
      ['attStmt', new Map<CborValue, CborValue>()],
      ['authData', authenticatorData],
    ]),
  );

  const clientDataJSON = clientData(
    'webauthn.create',
    tweaks.challenge ?? options.challenge,
    tweaks.origin ?? TEST_ORIGIN,
  );
  const id = toBase64Url(credentialId);

  return {
    credential: {
      id,
      rawId: id,
      type: 'public-key',
      authenticatorAttachment: 'platform',
      clientExtensionResults: { credProps: { rk: true } },
      response: {
        clientDataJSON: toBase64Url(clientDataJSON),
        attestationObject: toBase64Url(attestationObject),
        transports: ['internal', 'hybrid'],
      },
    },
    passkey: { credentialId: id, keyPair, userHandle: options.user.id },
  };
}

/** Firma el reto de entrada con la passkey, como `navigator.credentials.get`. */
export async function signInWithPasskey(
  options: LoginOptions,
  passkey: VirtualPasskey,
  tweaks: AssertionTweaks = {},
): Promise<AuthenticationCredential> {
  const authenticatorData = concat([
    await rpIdHash(tweaks.rpId ?? options.rpId),
    new Uint8Array([flags(tweaks.userVerified ?? true)]),
    counterBytes(tweaks.counter ?? 0),
  ]);
  const clientDataJSON = clientData(
    'webauthn.get',
    tweaks.challenge ?? options.challenge,
    tweaks.origin ?? TEST_ORIGIN,
  );

  const signedData = concat([
    authenticatorData,
    new Uint8Array(await crypto.subtle.digest('SHA-256', clientDataJSON)),
  ]);
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    tweaks.signingKey ?? passkey.keyPair.privateKey,
    signedData,
  );

  return {
    id: passkey.credentialId,
    rawId: passkey.credentialId,
    type: 'public-key',
    authenticatorAttachment: 'platform',
    clientExtensionResults: {},
    response: {
      clientDataJSON: toBase64Url(clientDataJSON),
      authenticatorData: toBase64Url(authenticatorData),
      signature: toBase64Url(p1363ToDer(new Uint8Array(signature))),
      userHandle: tweaks.userHandle ?? passkey.userHandle,
    },
  };
}

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  const generated = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  if (!('privateKey' in generated)) throw new Error('WebCrypto no devolvió un par de claves');

  return generated;
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');

  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

type CborValue = number | string | Uint8Array | ReadonlyMap<CborValue, CborValue>;

/** Lo justo de CBOR (RFC 8949) para una clave COSE y un `attestationObject`. */
function encodeCbor(value: CborValue): Uint8Array {
  if (typeof value === 'number') {
    return new Uint8Array(value >= 0 ? cborHead(0, value) : cborHead(1, -1 - value));
  }
  if (typeof value === 'string') {
    const bytes = new TextEncoder().encode(value);
    return concat([new Uint8Array(cborHead(3, bytes.length)), bytes]);
  }
  if (value instanceof Uint8Array) {
    return concat([new Uint8Array(cborHead(2, value.length)), value]);
  }

  const parts: Uint8Array[] = [new Uint8Array(cborHead(5, value.size))];
  for (const [key, item] of value) parts.push(encodeCbor(key), encodeCbor(item));

  return concat(parts);
}

function cborHead(majorType: number, length: number): number[] {
  const initial = majorType << 5;
  if (length < 24) return [initial | length];
  if (length < 0x100) return [initial | 24, length];
  if (length < 0x10000) return [initial | 25, length >> 8, length & 0xff];

  throw new Error(`Longitud CBOR más grande de lo que necesitan estos tests: ${String(length)}`);
}

/** WebCrypto firma ECDSA en P1363 (r ‖ s); un autenticador de verdad manda la firma en DER. */
function p1363ToDer(signature: Uint8Array): Uint8Array {
  const r = derInteger(signature.slice(0, 32));
  const s = derInteger(signature.slice(32));

  return new Uint8Array([0x30, r.length + s.length, ...r, ...s]);
}

/**
 * DER exige enteros mínimos: sin ceros a la izquierda, y con uno delante si el primer bit está
 * puesto, porque si no el entero se leería negativo. Es justo el caso que rompe a quien da por
 * hecho que `r` y `s` miden siempre 32 bytes.
 */
function derInteger(bytes: Uint8Array): number[] {
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0) start += 1;

  const digits = Array.from(bytes.slice(start));
  if (((digits[0] ?? 0) & 0x80) !== 0) digits.unshift(0);

  return [0x02, digits.length, ...digits];
}

function flags(userVerified: boolean): number {
  return (
    FLAG_USER_PRESENT |
    (userVerified ? FLAG_USER_VERIFIED : 0) |
    FLAG_BACKUP_ELIGIBLE |
    FLAG_BACKED_UP
  );
}

function counterBytes(counter: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, counter, false);

  return bytes;
}

async function rpIdHash(rpId: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId)));
}

function clientData(type: string, challenge: string, origin: string): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const joined = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }

  return joined;
}
