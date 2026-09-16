/**
 * El aviso de fin de descanso dentro del service worker (ADR 0009). El Worker manda el push **sin
 * carga**, así que el texto es siempre este: no hay nada que leer del mensaje.
 */
export const REST_NOTICE_TITLE = 'Descanso cumplido';
export const REST_NOTICE_BODY = 'Toca la siguiente serie.';

/**
 * Una sola notificación de descanso a la vez: la de la serie siguiente sustituye a la anterior en
 * vez de apilarse en la pantalla de bloqueo. `renotify` hace que la sustituta vuelva a sonar.
 */
export const REST_NOTICE_TAG = 'gymbuddy-rest-notice';

/** Adónde lleva tocar el aviso, relativo al scope del service worker. */
export const REST_NOTICE_PATH = 'session';

/** El icono ya está precacheado con el shell: se enseña aunque no haya red al llegar el aviso. */
const REST_NOTICE_ICON = 'pwa-192.png';

/** `renotify` no está en los tipos del DOM de TypeScript, pero Chrome lo respeta. */
export type RestNoticeOptions = NotificationOptions & { readonly renotify?: boolean };

/** Una ventana de la app, reducida a lo que el aviso usa de ella. */
export interface NoticeWindowClient {
  readonly url: string;
  readonly focus: () => Promise<unknown>;
  readonly navigate: (url: string) => Promise<unknown>;
}

export interface NoticeEvent {
  readonly waitUntil: (promise: Promise<unknown>) => void;
}

export interface NoticeClickEvent extends NoticeEvent {
  readonly notification: { readonly close: () => void };
}

/**
 * Lo que el aviso necesita del `ServiceWorkerGlobalScope`. Va detrás de una interfaz porque la PWA
 * compila con los tipos del DOM, que chocan con los de `WebWorker`, y porque así los tests montan un
 * scope falso sin service worker de verdad.
 */
export interface RestNoticeWorkerScope {
  readonly registration: {
    readonly scope: string;
    readonly showNotification: (title: string, options: RestNoticeOptions) => Promise<void>;
  };
  readonly clients: {
    readonly matchAll: (options: {
      readonly type: 'window';
      readonly includeUncontrolled: boolean;
    }) => Promise<readonly NoticeWindowClient[]>;
    readonly openWindow: (url: string) => Promise<unknown>;
  };
  addEventListener(type: 'push', listener: (event: NoticeEvent) => void): void;
  addEventListener(type: 'notificationclick', listener: (event: NoticeClickEvent) => void): void;
}

export function restNoticeOptions(scope: string): RestNoticeOptions {
  return {
    body: REST_NOTICE_BODY,
    tag: REST_NOTICE_TAG,
    renotify: true,
    icon: new URL(REST_NOTICE_ICON, scope).href,
    lang: 'es',
  };
}

/**
 * Qué ventana abierta reutilizar: la que ya está en la sesión y, si no, cualquiera de la app. Abrir
 * otra con una ya abierta dejaría dos copias de la app con dos relojes.
 */
export function pickNoticeClient(
  clients: readonly NoticeWindowClient[],
  sessionUrl: string,
): NoticeWindowClient | null {
  return clients.find((client) => client.url === sessionUrl) ?? clients[0] ?? null;
}

/**
 * Lleva a la sesión. Con una ventana abierta, se enfoca y se navega; `navigate` falla en una
 * ventana que este service worker aún no controla (la primera visita tras instalarlo), y entonces
 * basta con enfocarla: la app ya está delante.
 */
export async function openSessionFromNotice(scope: RestNoticeWorkerScope): Promise<void> {
  const sessionUrl = new URL(REST_NOTICE_PATH, scope.registration.scope).href;
  const windows = await scope.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const target = pickNoticeClient(windows, sessionUrl);

  if (target === null) {
    await scope.clients.openWindow(sessionUrl);
    return;
  }

  await target.focus();
  if (target.url === sessionUrl) return;
  try {
    await target.navigate(sessionUrl);
  } catch (error) {
    console.warn('No se pudo llevar la ventana a la sesión; se queda enfocada donde estaba', error);
  }
}

/**
 * Registra los manejadores. El de `push` **siempre** enseña la notificación, y dentro de
 * `waitUntil`: en iOS cada push que no enseña nada acerca a Safari a retirar la suscripción, y sin
 * `waitUntil` el navegador puede parar el service worker antes de que salga.
 */
export function installRestNoticeHandlers(scope: RestNoticeWorkerScope): void {
  scope.addEventListener('push', (event) => {
    event.waitUntil(
      scope.registration.showNotification(
        REST_NOTICE_TITLE,
        restNoticeOptions(scope.registration.scope),
      ),
    );
  });

  scope.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(openSessionFromNotice(scope));
  });
}
