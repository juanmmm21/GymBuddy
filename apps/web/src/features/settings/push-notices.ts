import { pushSubscriptionSchema } from '@gymbuddy/shared';
import type { ApiClient } from '../../api/client';
import { deletePushSubscription, savePushSubscription } from '../../api/endpoints';
import type { DevicePlatform } from '../install/platform';

/** La suscripción push del navegador, reducida a lo que la app usa de ella. */
export interface DevicePushSubscription {
  readonly endpoint: string;
  /** La clave VAPID con la que se creó; `null` si el navegador no la expone. */
  readonly applicationServerKey: ArrayBuffer | null;
  readonly toJSON: () => unknown;
  readonly unsubscribe: () => Promise<boolean>;
}

/**
 * Lo que la app necesita del navegador para los avisos. Va detrás de una interfaz, como las
 * passkeys: jsdom no tiene `PushManager` y ningún test puede tocar el servicio de push real.
 */
export interface PushBrowser {
  readonly permission: () => NotificationPermission;
  readonly requestPermission: () => Promise<NotificationPermission>;
  readonly getSubscription: () => Promise<DevicePushSubscription | null>;
  readonly subscribe: (
    applicationServerKey: Uint8Array<ArrayBuffer>,
  ) => Promise<DevicePushSubscription>;
}

export type PushAvailability =
  /** Se puede encender o apagar. */
  | 'available'
  /** Un iPhone solo recibe push con la app instalada en la pantalla de inicio (iOS 16.4+). */
  | 'needs_install'
  /** El navegador no tiene push ni notificaciones. */
  | 'unsupported'
  /** Se negó el permiso: solo se desbloquea desde los ajustes del sistema, no desde la app. */
  | 'blocked';

export interface PushAvailabilityInput {
  readonly platform: DevicePlatform;
  readonly installed: boolean;
  readonly browser: PushBrowser | null;
}

/**
 * Si este dispositivo puede recibir el aviso. En un iPhone sin instalar se pide instalar antes de
 * mirar el navegador: Safari en una pestaña no tiene `PushManager`, y «no compatible» haría creer
 * que el iPhone no puede.
 */
export function pushAvailability({
  platform,
  installed,
  browser,
}: PushAvailabilityInput): PushAvailability {
  if (platform === 'ios' && !installed) return 'needs_install';
  if (browser === null) return 'unsupported';
  if (browser.permission() === 'denied') return 'blocked';
  return 'available';
}

/** Bytes de una cadena base64url, con o sin relleno. Lanza si no es base64url. */
export function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(value)) {
    throw new Error('La clave no está en base64url');
  }
  const base64 = value.replace(/=+$/, '').replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function sameKey(current: ArrayBuffer | null, expected: Uint8Array): boolean {
  if (current === null) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === expected.length && bytes.every((byte, index) => byte === expected[index]);
}

/** Encendido en este dispositivo: con permiso y con una suscripción viva. */
export async function readPushNoticesEnabled(browser: PushBrowser): Promise<boolean> {
  if (browser.permission() !== 'granted') return false;
  return (await browser.getSubscription()) !== null;
}

export type EnablePushOutcome = 'enabled' | 'not_granted';

/**
 * Enciende el aviso: suscribe el navegador con la clave del servidor y se lo cuenta al Worker.
 *
 * El permiso llega ya pedido: iOS solo lo pregunta si la petición sale del mismo toque, así que
 * quien pulsa lo pide antes de cualquier espera y aquí solo se espera la respuesta.
 *
 * Si el Worker no la guarda, la suscripción recién creada se retira: el interruptor lee el
 * navegador, y un navegador suscrito del que el servidor no sabe nada enseñaría «encendido» sin
 * que nunca llegase un aviso.
 */
export async function enablePushNotices(
  browser: PushBrowser,
  client: ApiClient,
  publicKey: string,
  permission: Promise<NotificationPermission>,
): Promise<EnablePushOutcome> {
  if ((await permission) !== 'granted') return 'not_granted';

  const key = decodeBase64Url(publicKey);
  const existing = await browser.getSubscription();
  const reused = existing !== null && sameKey(existing.applicationServerKey, key);
  // Una suscripción con otra clave (las del servidor se rotaron) no puede recibir los avisos
  // nuevos, y el navegador no deja suscribirse con otra clave sin retirarla antes.
  if (existing !== null && !reused) await existing.unsubscribe();
  const subscription = reused ? existing : await browser.subscribe(key);

  try {
    const parsed = pushSubscriptionSchema.safeParse(subscription.toJSON());
    if (!parsed.success) {
      throw new Error('El navegador dio una suscripción push que no cumple el contrato');
    }
    await savePushSubscription(client, parsed.data);
  } catch (error) {
    if (!reused) await retireQuietly(subscription);
    throw error;
  }

  return 'enabled';
}

/**
 * Apaga el aviso en este dispositivo. Primero se retira la suscripción del navegador: desde ese
 * momento su endpoint está muerto y no puede llegar nada, haya red o no. Decírselo al Worker es
 * limpieza; si falla (sin cobertura), la fila muerta se retira sola cuando el servicio de push
 * responda que ya no existe al mandarle un aviso.
 */
export async function disablePushNotices(browser: PushBrowser, client: ApiClient): Promise<void> {
  const subscription = await browser.getSubscription();
  if (subscription === null) return;

  const { endpoint } = subscription;
  if (!(await subscription.unsubscribe())) {
    throw new Error('El navegador no pudo retirar la suscripción push');
  }

  try {
    await deletePushSubscription(client, { endpoint });
  } catch (error) {
    console.warn(
      'No se pudo retirar la suscripción push del servidor; se retirará al fallar',
      error,
    );
  }
}

async function retireQuietly(subscription: DevicePushSubscription): Promise<void> {
  try {
    await subscription.unsubscribe();
  } catch (error) {
    // Lo que importa es el fallo original, que se relanza; este solo se deja registrado.
    console.error('No se pudo retirar la suscripción push tras fallar al guardarla', error);
  }
}
