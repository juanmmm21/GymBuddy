import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { RouterProvider, type createMemoryRouter } from 'react-router';
import { ApiClient } from '../api/client';
import { ApiClientProvider } from '../api/provider';
import { AuthenticatorProvider } from '../auth/AuthenticatorProvider';
import {
  browserPasskeyAuthenticator,
  type PasskeyAuthenticator,
} from '../auth/passkey-authenticator';
import { SessionProvider, useSession } from '../auth/SessionProvider';
import type { StorageLike } from '../lib/storage';
import { createAppRouter } from './router';
import { StorageProvider } from './StorageProvider';

export interface AppProps {
  readonly apiBaseUrl: string;
  readonly storage: StorageLike;
  /** Los tests inyectan un router en memoria y un `fetch` falso; la app usa los reales. */
  readonly router?: ReturnType<typeof createMemoryRouter>;
  readonly fetchImpl?: typeof fetch;
  /** Igual con las passkeys: jsdom no tiene WebAuthn. */
  readonly authenticator?: PasskeyAuthenticator;
}

/** Medio minuto sin volver a pedir lo mismo: entre pantalla y pantalla no cambia nada. */
const STALE_TIME_MS = 30_000;

export function App({
  apiBaseUrl,
  storage,
  router,
  fetchImpl,
  authenticator = browserPasskeyAuthenticator,
}: AppProps) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: STALE_TIME_MS } } }),
  );
  const [appRouter] = useState(() => router ?? createAppRouter());

  return (
    <QueryClientProvider client={queryClient}>
      <StorageProvider storage={storage}>
        <SessionProvider storage={storage}>
          <ApiBoundary apiBaseUrl={apiBaseUrl} fetchImpl={fetchImpl} queryClient={queryClient}>
            <AuthenticatorProvider authenticator={authenticator}>
              <RouterProvider router={appRouter} />
            </AuthenticatorProvider>
          </ApiBoundary>
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
 * pantalla del siguiente.
 */
function ApiBoundary({ apiBaseUrl, fetchImpl, queryClient, children }: ApiBoundaryProps) {
  const { session, signOut, renew } = useSession();
  const token = session?.token ?? null;

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
    if (token === null) queryClient.clear();
  }, [queryClient, token]);

  return <ApiClientProvider client={client}>{children}</ApiClientProvider>;
}
