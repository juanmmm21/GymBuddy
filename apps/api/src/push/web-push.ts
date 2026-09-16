import { p256PublicKeySchema } from '@gymbuddy/shared';
import { readSecret } from '../http/env';

/** El par VAPID con el que el Worker firma los avisos, las dos mitades en base64url. */
export interface VapidKeys {
  readonly publicKey: string;
  readonly privateKey: string;
}

/** Cómo terminó un envío: entregado al servicio de push, suscripción muerta o fallo pasajero. */
export type PushDelivery = 'delivered' | 'gone' | 'failed';

/** Lo que el Worker necesita para mandar un aviso a un navegador. */
export interface PushTarget {
  readonly endpoint: string;
}

export interface EmptyPushOptions {
  readonly keys: VapidKeys;
  /** Quién firma (RFC 8292): una URL https o un `mailto:`. Apple rechaza el aviso sin él. */
  readonly subject: string;
  /** Segundos que el servicio de push guarda el aviso si el móvil no está localizable. */
  readonly ttlSeconds: number;
  readonly now: Date;
  readonly fetchImpl: typeof fetch;
}

/** La firma vale doce horas: el máximo del RFC 8292 son veinticuatro y no hace falta apurarlo. */
const VAPID_TOKEN_LIFETIME_SECONDS = 12 * 60 * 60;

/** La privada es el escalar de la curva: 32 bytes. */
const P256_PRIVATE_KEY_BYTES = 32;

/**
 * Las dos mitades de la clave VAPID, o `null` si el servidor no puede firmar avisos. Con solo una,
 * o con una pública que no es un punto P-256, el aviso queda apagado y se registra como fallo de
 * despliegue: no es culpa de quien pregunta.
 */
export function readVapidKeys(env: Env): VapidKeys | null {
  const publicKey = readSecret(env, 'VAPID_PUBLIC_KEY');
  const privateKey = readSecret(env, 'VAPID_PRIVATE_KEY');
  if (publicKey === undefined || privateKey === undefined) return null;

  if (!p256PublicKeySchema.safeParse(publicKey).success) {
    console.error('VAPID_PUBLIC_KEY no es una clave P-256 en base64url: el aviso queda apagado');
    return null;
  }

  return { publicKey: stripPadding(publicKey), privateKey: stripPadding(privateKey) };
}

/**
 * La cabecera `Authorization` de un aviso (RFC 8292): un JWT ES256 con el origen del servicio de
 * push como audiencia, y la clave pública al lado para que el servicio compruebe que es la misma con
 * la que se suscribió el navegador.
 */
export async function vapidAuthorization(
  endpoint: string,
  keys: VapidKeys,
  subject: string,
  now: Date,
): Promise<string> {
  const header = encodeJson({ typ: 'JWT', alg: 'ES256' });
  const claims = encodeJson({
    aud: new URL(endpoint).origin,
    exp: Math.floor(now.getTime() / 1000) + VAPID_TOKEN_LIFETIME_SECONDS,
    sub: subject,
  });
  const unsigned = `${header}.${claims}`;

  const signingKey = await importVapidPrivateKey(keys);
  // WebCrypto firma ECDSA en formato P1363 (r y s de 32 bytes seguidos), que es justo lo que pide
  // un JWT: no hay que pasar por DER como con las passkeys.
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signingKey,
    new TextEncoder().encode(unsigned),
  );

  return `vapid t=${unsigned}.${encodeBase64Url(new Uint8Array(signature))}, k=${keys.publicKey}`;
}

/**
 * Manda un aviso SIN CARGA. Cifrar una carga (RFC 8291) es un ECDH, un HKDF y un AES-GCM por
 * navegador, y el plan gratuito da 10 ms de CPU; el aviso de descanso dice siempre lo mismo, así que
 * el texto lo pone el service worker. Nunca lanza: un navegador que falla no puede dejar sin aviso a
 * los demás de la cuenta.
 */
export async function sendEmptyPush(
  target: PushTarget,
  options: EmptyPushOptions,
): Promise<PushDelivery> {
  try {
    const authorization = await vapidAuthorization(
      target.endpoint,
      options.keys,
      options.subject,
      options.now,
    );
    const response = await options.fetchImpl(target.endpoint, {
      method: 'POST',
      headers: {
        authorization,
        ttl: String(options.ttlSeconds),
        // «high» despierta al móvil aunque esté en ahorro de batería: un descanso no espera.
        urgency: 'high',
        'content-length': '0',
      },
    });

    if (response.ok) return 'delivered';
    // 404 y 410 son la forma en que el servicio dice que esa suscripción ya no existe.
    if (response.status === 404 || response.status === 410) return 'gone';

    console.error(
      `El servicio de push respondió ${String(response.status)} al aviso de descanso`,
      new URL(target.endpoint).origin,
    );
    return 'failed';
  } catch (error) {
    console.error('No se pudo mandar el aviso de descanso', error);
    return 'failed';
  }
}

async function importVapidPrivateKey(keys: VapidKeys): Promise<CryptoKey> {
  const point = decodeBase64Url(keys.publicKey);
  const scalar = decodeBase64Url(keys.privateKey);
  if (scalar.length !== P256_PRIVATE_KEY_BYTES) {
    throw new Error('VAPID_PRIVATE_KEY no es un escalar P-256 de 32 bytes en base64url');
  }

  // El punto sin comprimir es 0x04 seguido de x e y, 32 bytes cada una.
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: encodeBase64Url(point.subarray(1, 33)),
    y: encodeBase64Url(point.subarray(33, 65)),
    d: keys.privateKey,
    ext: false,
  };

  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
  ]);
}

function encodeJson(value: unknown): string {
  return encodeBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return stripPadding(btoa(binary).replaceAll('+', '-').replaceAll('/', '_'));
}

export function decodeBase64Url(value: string): Uint8Array {
  const base64 = stripPadding(value).replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));

  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function stripPadding(value: string): string {
  return value.replace(/=+$/, '');
}
