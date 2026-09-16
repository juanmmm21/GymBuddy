import { render } from '@testing-library/react';
import type { Session } from '@gymbuddy/shared';
import { App } from '../../src/app/App';
import { createTestRouter } from '../../src/app/router';
import {
  PasskeyCeremonyError,
  type PasskeyAuthenticator,
} from '../../src/auth/passkey-authenticator';
import { SESSION_STORAGE_KEY } from '../../src/auth/session-store';
import type { PhotoCodec } from '../../src/features/exercises/photo-compression';
import type { InstallSupport } from '../../src/features/install/InstallProvider';
import type { PushBrowser } from '../../src/features/settings/push-notices';
import type { StorageLike } from '../../src/lib/storage';
import {
  createMemoryWriteQueueStore,
  type MemoryWriteQueueStore,
} from '../../src/offline/write-queue-store';
import { createFakeFetch, type FakeFetch } from '../fake-fetch';

export interface RenderedApp {
  readonly fake: FakeFetch;
  readonly storage: StorageLike & { readonly data: Map<string, string> };
  /** La cola offline guardada en el dispositivo, para ver qué se encoló y qué se retiró. */
  readonly queueStore: MemoryWriteQueueStore;
}

/**
 * Sin autenticador explícito, el de un navegador sin llaves de acceso: ningún test de pantalla
 * crea o usa una passkey por accidente.
 */
const noPasskeys: PasskeyAuthenticator = {
  isSupported: () => false,
  create: () => Promise.reject(new PasskeyCeremonyError('unsupported', 'Sin passkeys en el test')),
  get: () => Promise.reject(new PasskeyCeremonyError('unsupported', 'Sin passkeys en el test')),
};

/** Monta la app entera con un router en memoria, un `fetch` falso y un almacenamiento en memoria. */
export function renderApp(options: {
  readonly path: string;
  readonly session?: Session;
  /** Lo que ya estaba guardado en el dispositivo al abrir la app, aparte de la sesión. */
  readonly stored?: Readonly<Record<string, string>>;
  readonly authenticator?: PasskeyAuthenticator;
  /** Escrituras que quedaron en la cola la última vez que se abrió la app. */
  readonly queued?: readonly unknown[];
  /** El navegador en el que se abre: por defecto, el de jsdom, que pasa por uno de escritorio. */
  readonly install?: InstallSupport;
  /** El push del navegador; por defecto, ninguno, como jsdom. */
  readonly pushBrowser?: PushBrowser | null;
  /** El codificador de fotos; por defecto, ninguno, como jsdom. */
  readonly photoCodec?: PhotoCodec | null;
  readonly setup?: (fake: FakeFetch) => void;
}): RenderedApp {
  const fake = createFakeFetch();
  options.setup?.(fake);

  const data = new Map<string, string>(Object.entries(options.stored ?? {}));
  if (options.session !== undefined) data.set(SESSION_STORAGE_KEY, JSON.stringify(options.session));
  const storage = {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };

  const queueStore = createMemoryWriteQueueStore(options.queued);

  render(
    <App
      apiBaseUrl=""
      storage={storage}
      router={createTestRouter(options.path)}
      fetchImpl={fake.fetch}
      authenticator={options.authenticator ?? noPasskeys}
      writeQueueStore={queueStore}
      pushBrowser={options.pushBrowser ?? null}
      photoCodec={options.photoCodec ?? null}
      {...(options.install === undefined ? {} : { install: options.install })}
    />,
  );

  return { fake, storage, queueStore };
}
