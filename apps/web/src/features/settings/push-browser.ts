import type { DevicePushSubscription, PushBrowser } from './push-notices';

/**
 * Lo que se espera al service worker. Sin él no hay `PushManager`, y `serviceWorker.ready` no
 * falla nunca: se queda esperando (en `vite dev` no se registra ninguno), y el interruptor giraría
 * para siempre en vez de decir que algo ha ido mal.
 */
const SERVICE_WORKER_READY_TIMEOUT_MS = 10_000;

/** El navegador de verdad, o `null` si no tiene service worker, push o notificaciones. */
export function createBrowserPushBrowser(): PushBrowser | null {
  if (
    !('serviceWorker' in navigator) ||
    !('PushManager' in globalThis) ||
    !('Notification' in globalThis)
  ) {
    return null;
  }

  return {
    permission: () => Notification.permission,
    requestPermission: () => Notification.requestPermission(),
    getSubscription: async () => {
      const registration = await readyRegistration();
      const subscription = await registration.pushManager.getSubscription();
      return subscription === null ? null : toDeviceSubscription(subscription);
    },
    subscribe: async (applicationServerKey) => {
      const registration = await readyRegistration();
      // `userVisibleOnly` es obligatorio: Chrome y Safari no aceptan push que no se enseñe.
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
      return toDeviceSubscription(subscription);
    },
  };
}

function readyRegistration(): Promise<ServiceWorkerRegistration> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('El service worker de la app no está listo'));
    }, SERVICE_WORKER_READY_TIMEOUT_MS);
    navigator.serviceWorker.ready.then(
      (registration) => {
        clearTimeout(timer);
        resolve(registration);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('El service worker no arrancó'));
      },
    );
  });
}

function toDeviceSubscription(subscription: PushSubscription): DevicePushSubscription {
  return {
    endpoint: subscription.endpoint,
    applicationServerKey: subscription.options.applicationServerKey,
    toJSON: () => subscription.toJSON(),
    unsubscribe: () => subscription.unsubscribe(),
  };
}
