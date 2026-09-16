import { describe, expect, it } from 'vitest';
import {
  REST_NOTICE_BODY,
  REST_NOTICE_TAG,
  REST_NOTICE_TITLE,
  installRestNoticeHandlers,
  pickNoticeClient,
  type NoticeClickEvent,
  type NoticeEvent,
  type NoticeWindowClient,
  type RestNoticeOptions,
  type RestNoticeWorkerScope,
} from '../../src/offline/rest-notice-worker';
import { PUSH_SW_FILE_NAME, workboxOptions } from '../../src/offline/service-worker';

const SCOPE = 'https://gymbuddy.juanmmm21.workers.dev/';
const SESSION_URL = `${SCOPE}session`;

interface FakeWindow extends NoticeWindowClient {
  readonly focused: () => boolean;
  readonly navigatedTo: () => string | null;
}

function fakeWindow(url: string, options: { readonly navigateFails?: boolean } = {}): FakeWindow {
  let focused = false;
  let navigatedTo: string | null = null;
  return {
    url,
    focus: () => {
      focused = true;
      return Promise.resolve();
    },
    navigate: (target) => {
      if (options.navigateFails === true) {
        return Promise.reject(new TypeError('Esta ventana no la controla el service worker'));
      }
      navigatedTo = target;
      return Promise.resolve();
    },
    focused: () => focused,
    navigatedTo: () => navigatedTo,
  };
}

interface FakeScope {
  readonly scope: RestNoticeWorkerScope;
  readonly shown: () => readonly { title: string; options: RestNoticeOptions }[];
  readonly opened: () => readonly string[];
  /** Dispara un evento y espera a lo que el manejador dejó en `waitUntil`. */
  readonly dispatchPush: () => Promise<void>;
  readonly dispatchClick: () => Promise<{ closed: boolean }>;
}

function createFakeScope(windows: readonly NoticeWindowClient[] = []): FakeScope {
  const shown: { title: string; options: RestNoticeOptions }[] = [];
  const opened: string[] = [];
  let pushListener: ((event: NoticeEvent) => void) | null = null;
  let clickListener: ((event: NoticeClickEvent) => void) | null = null;

  const scope: RestNoticeWorkerScope = {
    registration: {
      scope: SCOPE,
      showNotification: (title, options) => {
        shown.push({ title, options });
        return Promise.resolve();
      },
    },
    clients: {
      matchAll: () => Promise.resolve(windows),
      openWindow: (url) => {
        opened.push(url);
        return Promise.resolve(null);
      },
    },
    addEventListener: (type: 'push' | 'notificationclick', listener: never) => {
      if (type === 'push') pushListener = listener;
      else clickListener = listener;
    },
  };

  return {
    scope,
    shown: () => shown,
    opened: () => opened,
    dispatchPush: async () => {
      const pending: Promise<unknown>[] = [];
      if (pushListener === null) throw new Error('Sin manejador de push');
      pushListener({ waitUntil: (promise) => pending.push(promise) });
      expect(pending).toHaveLength(1);
      await Promise.all(pending);
    },
    dispatchClick: async () => {
      const pending: Promise<unknown>[] = [];
      let closed = false;
      if (clickListener === null) throw new Error('Sin manejador de clic');
      clickListener({
        waitUntil: (promise) => pending.push(promise),
        notification: {
          close: () => {
            closed = true;
          },
        },
      });
      expect(pending).toHaveLength(1);
      await Promise.all(pending);
      return { closed };
    },
  };
}

describe('el aviso de fin de descanso en el service worker', () => {
  it('un push sin carga enseña siempre la notificación del descanso, dentro de waitUntil', async () => {
    const fake = createFakeScope();
    installRestNoticeHandlers(fake.scope);

    await fake.dispatchPush();

    expect(fake.shown()).toEqual([
      {
        title: REST_NOTICE_TITLE,
        options: {
          body: REST_NOTICE_BODY,
          tag: REST_NOTICE_TAG,
          renotify: true,
          icon: `${SCOPE}pwa-192.png`,
          lang: 'es',
        },
      },
    ]);
  });

  it('cada push enseña la suya: dos descansos son dos avisos que suenan', async () => {
    const fake = createFakeScope();
    installRestNoticeHandlers(fake.scope);

    await fake.dispatchPush();
    await fake.dispatchPush();

    expect(fake.shown()).toHaveLength(2);
  });

  it('tocar el aviso sin la app abierta abre la sesión', async () => {
    const fake = createFakeScope();
    installRestNoticeHandlers(fake.scope);

    const { closed } = await fake.dispatchClick();

    expect(closed).toBe(true);
    expect(fake.opened()).toEqual([SESSION_URL]);
  });

  it('con la app abierta en otra pantalla la enfoca y la lleva a la sesión, sin abrir otra', async () => {
    const home = fakeWindow(SCOPE);
    const fake = createFakeScope([home]);
    installRestNoticeHandlers(fake.scope);

    await fake.dispatchClick();

    expect(home.focused()).toBe(true);
    expect(home.navigatedTo()).toBe(SESSION_URL);
    expect(fake.opened()).toEqual([]);
  });

  it('si una ventana ya está en la sesión, se enfoca esa y no se navega', async () => {
    const catalog = fakeWindow(`${SCOPE}catalog`);
    const session = fakeWindow(SESSION_URL);
    const fake = createFakeScope([catalog, session]);
    installRestNoticeHandlers(fake.scope);

    await fake.dispatchClick();

    expect(session.focused()).toBe(true);
    expect(session.navigatedTo()).toBeNull();
    expect(catalog.focused()).toBe(false);
  });

  it('una ventana que no se deja navegar se queda enfocada y el clic no falla', async () => {
    const uncontrolled = fakeWindow(SCOPE, { navigateFails: true });
    const fake = createFakeScope([uncontrolled]);
    installRestNoticeHandlers(fake.scope);

    await expect(fake.dispatchClick()).resolves.toEqual({ closed: true });
    expect(uncontrolled.focused()).toBe(true);
    expect(fake.opened()).toEqual([]);
  });

  it('sin ventanas no elige ninguna', () => {
    expect(pickNoticeClient([], SESSION_URL)).toBeNull();
  });

  it('el sw.js generado carga el manejador', () => {
    expect(workboxOptions.importScripts).toEqual([PUSH_SW_FILE_NAME]);
  });
});
