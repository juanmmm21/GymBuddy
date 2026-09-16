import type { DevicePushSubscription, PushBrowser } from '../src/features/settings/push-notices';
import { decodeBase64Url } from '../src/features/settings/push-notices';

// Claves sintéticas: un par P-256 y un secreto de 16 bytes generados para estas pruebas.
export const VAPID_PUBLIC_KEY =
  'BCZltgBrlYNek3lk5DDef_GcR7Mt19V45keKylwUMrIrosu4xn94--ID_9wnrEFE-MyrksZ61P96Ouq3Q67dsaI';
export const ROTATED_VAPID_PUBLIC_KEY =
  'BAgg4whJaw5eqQp4O_cggX1GRGJJ_CmGqE_0yFbeWs_ehP7pFjffJofcgZJrN19fua5DiZ5fgkFtH11xgw7GUm0';
const P256DH = VAPID_PUBLIC_KEY;
const AUTH = 'LKrqIdpLO2NUv4Lq9iATtw';

export interface FakePushBrowser extends PushBrowser {
  /** La suscripción viva en el navegador, o `null`. */
  readonly current: () => DevicePushSubscription | null;
  readonly subscribeCalls: () => number;
  readonly unsubscribeCalls: () => number;
  /** Cuántas veces se pidió permiso; sirve para ver que se pide solo al encender. */
  readonly permissionRequests: () => number;
}

export interface FakePushBrowserOptions {
  readonly permission?: NotificationPermission;
  /** Lo que contesta la persona al preguntarle. */
  readonly answer?: NotificationPermission;
  /** Una suscripción que ya estaba, creada con esta clave. */
  readonly subscribedWith?: string;
  /** Lo que devuelve `toJSON()`; por defecto, una suscripción válida. */
  readonly json?: (endpoint: string) => unknown;
}

/** Un navegador con push en memoria: guarda una suscripción como lo haría `PushManager`. */
export function createFakePushBrowser(options: FakePushBrowserOptions = {}): FakePushBrowser {
  let permission: NotificationPermission = options.permission ?? 'default';
  let current: DevicePushSubscription | null = null;
  let created = 0;
  let subscribes = 0;
  let unsubscribes = 0;
  let requests = 0;

  const makeSubscription = (key: Uint8Array): DevicePushSubscription => {
    created += 1;
    const endpoint = `https://web.push.apple.com/suscripcion-${String(created)}`;
    const subscription: DevicePushSubscription = {
      endpoint,
      applicationServerKey: key.slice().buffer,
      toJSON: () =>
        options.json?.(endpoint) ?? {
          endpoint,
          expirationTime: null,
          keys: { p256dh: P256DH, auth: AUTH },
        },
      unsubscribe: () => {
        unsubscribes += 1;
        if (current === subscription) current = null;
        return Promise.resolve(true);
      },
    };
    return subscription;
  };

  if (options.subscribedWith !== undefined) {
    current = makeSubscription(decodeBase64Url(options.subscribedWith));
  }

  return {
    permission: () => permission,
    requestPermission: () => {
      requests += 1;
      permission = options.answer ?? 'granted';
      return Promise.resolve(permission);
    },
    getSubscription: () => Promise.resolve(current),
    subscribe: (key) => {
      subscribes += 1;
      current = makeSubscription(key);
      return Promise.resolve(current);
    },
    current: () => current,
    subscribeCalls: () => subscribes,
    unsubscribeCalls: () => unsubscribes,
    permissionRequests: () => requests,
  };
}
