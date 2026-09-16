import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { RouterProvider, type createMemoryRouter } from 'react-router';
import { ApiClient } from '../api/client';
import { invalidateTrainingData } from '../api/mutations';
import { ApiClientProvider } from '../api/provider';
import { AuthenticatorProvider } from '../auth/AuthenticatorProvider';
import {
  browserPasskeyAuthenticator,
  type PasskeyAuthenticator,
} from '../auth/passkey-authenticator';
import { SessionProvider, useSession } from '../auth/SessionProvider';
import { loadStoredSession } from '../auth/session-store';
import { createBrowserPhotoCodec } from '../features/exercises/browser-photo-codec';
import type { PhotoCodec } from '../features/exercises/photo-compression';
import { PhotoCodecProvider } from '../features/exercises/PhotoCodecProvider';
import { createBrowserVideoConverter } from '../features/exercises/browser-video-converter';
import type { VideoConverter } from '../features/exercises/video-conversion';
import { VideoConverterProvider } from '../features/exercises/VideoConverterProvider';
import { unavailableInstallPrompt } from '../features/install/install-prompt';
import { InstallProvider, type InstallSupport } from '../features/install/InstallProvider';
import { readBrowserEnvironment } from '../features/install/platform';
import { createBrowserPushBrowser } from '../features/settings/push-browser';
import type { PushBrowser } from '../features/settings/push-notices';
import { PushBrowserProvider } from '../features/settings/PushBrowserProvider';
import type { StorageLike } from '../lib/storage';
import {
  clearDeviceSnapshot,
  persistDeviceSnapshot,
  restoreDeviceSnapshot,
} from '../offline/device-snapshot';
import { WriteQueue } from '../offline/write-queue';
import { createBrowserWriteQueueStore, type WriteQueueStore } from '../offline/write-queue-store';
import { useQueueDrainer, WriteQueueProvider } from '../offline/WriteQueueProvider';
import { createAppRouter } from './router';
import { StorageProvider, useStorage } from './StorageProvider';

export interface AppProps {
  readonly apiBaseUrl: string;
  readonly storage: StorageLike;
  /** Los tests inyectan un router en memoria y un `fetch` falso; la app usa los reales. */
  readonly router?: ReturnType<typeof createMemoryRouter>;
  readonly fetchImpl?: typeof fetch;
  /** Igual con las passkeys: jsdom no tiene WebAuthn. */
  readonly authenticator?: PasskeyAuthenticator;
  /** Y con la cola offline: los tests la guardan en memoria para leer lo que se encoló. */
  readonly writeQueueStore?: WriteQueueStore;
  /** El entorno del navegador y el diálogo de instalación; los tests simulan un iPhone o un chat. */
  readonly install?: InstallSupport;
  /** El push del navegador; `null` simula uno sin push. Sin pasarlo, el del navegador real. */
  readonly pushBrowser?: PushBrowser | null;
  /** El codificador de fotos; `null` simula un navegador sin canvas, como jsdom. */
  readonly photoCodec?: PhotoCodec | null;
  /** El conversor de vídeo; `null` simula un navegador sin WebCodecs, como jsdom. */
  readonly videoConverter?: VideoConverter | null;
}

/** Medio minuto sin volver a pedir lo mismo: entre pantalla y pantalla no cambia nada. */
const STALE_TIME_MS = 30_000;

/**
 * Deja al router aplicar una navegación sin transición cuando se le pide (`flushSync: true`): el
 * buscador del catálogo escribe así el texto en la URL, o el campo se quedaría por detrás de lo
 * tecleado. Se pasa a mano y no con el `RouterProvider` de `react-router/dom` porque en Vitest ese
 * carga otra copia del paquete, que no comparte el contexto del router con el resto de la app.
 */
function flushRouterUpdate(update: () => unknown): undefined {
  flushSync(update);
  return undefined;
}

export function App({
  apiBaseUrl,
  storage,
  router,
  fetchImpl,
  authenticator = browserPasskeyAuthenticator,
  writeQueueStore,
  install,
  pushBrowser,
  photoCodec,
  videoConverter,
}: AppProps) {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: {
        // `always`: con el modo por defecto, sin red TanStack Query congela la lectura y una
        // pantalla sin datos guardados se queda en el spinner para siempre en vez de decirlo.
        queries: { staleTime: STALE_TIME_MS, networkMode: 'always' },
      },
    });
    // Antes del primer pintado: abierta sin red, la app enseña lo último que vio de esta cuenta.
    const stored = loadStoredSession(storage, new Date());
    if (stored !== null) restoreDeviceSnapshot(client, storage, stored.user.id);
    return client;
  });
  const [appRouter] = useState(() => router ?? createAppRouter());
  const [installSupport] = useState<InstallSupport>(
    () =>
      install ?? { environment: readBrowserEnvironment(window), prompt: unavailableInstallPrompt },
  );
  const [devicePush] = useState<PushBrowser | null>(() =>
    pushBrowser === undefined ? createBrowserPushBrowser() : pushBrowser,
  );
  const [devicePhotoCodec] = useState<PhotoCodec | null>(() =>
    photoCodec === undefined ? createBrowserPhotoCodec() : photoCodec,
  );
  const [deviceVideoConverter] = useState<VideoConverter | null>(() =>
    videoConverter === undefined ? createBrowserVideoConverter() : videoConverter,
  );
  // Una sola cola por app: lee lo que quedó guardado al abrirla y no se rehace con el token.
  const [writeQueue] = useState(
    () => new WriteQueue({ store: writeQueueStore ?? createBrowserWriteQueueStore() }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <StorageProvider storage={storage}>
        <SessionProvider storage={storage}>
          <WriteQueueProvider queue={writeQueue}>
            <ApiBoundary apiBaseUrl={apiBaseUrl} fetchImpl={fetchImpl} queryClient={queryClient}>
              <AuthenticatorProvider authenticator={authenticator}>
                <InstallProvider support={installSupport}>
                  <PushBrowserProvider browser={devicePush}>
                    <PhotoCodecProvider codec={devicePhotoCodec}>
                      <VideoConverterProvider converter={deviceVideoConverter}>
                        <RouterProvider router={appRouter} flushSync={flushRouterUpdate} />
                      </VideoConverterProvider>
                    </PhotoCodecProvider>
                  </PushBrowserProvider>
                </InstallProvider>
              </AuthenticatorProvider>
            </ApiBoundary>
          </WriteQueueProvider>
        </SessionProvider>
      </StorageProvider>
    </QueryClientProvider>
  );
}

interface ApiBoundaryProps {
  readonly apiBaseUrl: string;
  readonly fetchImpl: typeof fetch | undefined;
  readonly queryClient: QueryClient;
  readonly children: ReactNode;
}

/**
 * Construye el cliente con el token de la sesión actual. Cambia con el token, y al
 * cerrar sesión se vacía la caché: los datos de un usuario no pueden asomar en la
 * pantalla del siguiente, ni en la caché ni en lo guardado en el dispositivo. Es también quien
 * conecta la cola offline a la cuenta y la drena, y quien guarda lo que hace falta sin red.
 */
function ApiBoundary({ apiBaseUrl, fetchImpl, queryClient, children }: ApiBoundaryProps) {
  const { session, signOut, renew } = useSession();
  const storage = useStorage();
  const token = session?.token ?? null;
  const userId = session?.user.id ?? null;

  // El cliente se rehace con cada token renovado, pero la caché de TanStack Query no se toca:
  // solo se vacía al cerrar sesión, abajo. Las claves no dependen del cliente.
  const client = useMemo(
    () =>
      new ApiClient({
        baseUrl: apiBaseUrl,
        getToken: () => token,
        onUnauthorized: signOut,
        onSessionRefreshed: renew,
        ...(fetchImpl === undefined ? {} : { fetchImpl }),
      }),
    [apiBaseUrl, fetchImpl, renew, signOut, token],
  );

  useEffect(() => {
    if (token !== null) return;
    queryClient.clear();
    clearDeviceSnapshot(storage);
  }, [queryClient, storage, token]);

  useEffect(
    () => (userId === null ? undefined : persistDeviceSnapshot(queryClient, storage, userId)),
    [queryClient, storage, userId],
  );

  // Lo que la cola manda después cambia la sesión, el peso habitual y las marcas igual que
  // escribirlo en el momento, así que se relee lo mismo que tras una escritura directa.
  const refreshAfterDrain = useCallback(() => {
    void invalidateTrainingData(queryClient);
  }, [queryClient]);
  useQueueDrainer({ client, userId, onSettled: refreshAfterDrain });

  return <ApiClientProvider client={client}>{children}</ApiClientProvider>;
}
