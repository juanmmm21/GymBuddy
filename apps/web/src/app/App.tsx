import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { RouterProvider, type createMemoryRouter } from 'react-router';
import { ApiClient } from '../api/client';
import { ApiClientProvider } from '../api/provider';
import { SessionProvider, useSession } from '../auth/SessionProvider';
import type { SessionStorageLike } from '../auth/session-store';
import { createAppRouter } from './router';

export interface AppProps {
  readonly apiBaseUrl: string;
  readonly storage: SessionStorageLike;
  /** Los tests inyectan un router en memoria y un `fetch` falso; la app usa los reales. */
  readonly router?: ReturnType<typeof createMemoryRouter>;
  readonly fetchImpl?: typeof fetch;
}

/** Medio minuto sin volver a pedir lo mismo: entre pantalla y pantalla no cambia nada. */
const STALE_TIME_MS = 30_000;

export function App({ apiBaseUrl, storage, router, fetchImpl }: AppProps) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: STALE_TIME_MS } } }),
  );
  const [appRouter] = useState(() => router ?? createAppRouter());

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider storage={storage}>
        <ApiBoundary apiBaseUrl={apiBaseUrl} fetchImpl={fetchImpl} queryClient={queryClient}>
          <RouterProvider router={appRouter} />
        </ApiBoundary>
      </SessionProvider>
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
  const { session, signOut } = useSession();
  const token = session?.token ?? null;

  const client = useMemo(
    () =>
      new ApiClient({
        baseUrl: apiBaseUrl,
        getToken: () => token,
        onUnauthorized: signOut,
        ...(fetchImpl === undefined ? {} : { fetchImpl }),
      }),
    [apiBaseUrl, fetchImpl, signOut, token],
  );

  useEffect(() => {
    if (token === null) queryClient.clear();
  }, [queryClient, token]);

  return <ApiClientProvider client={client}>{children}</ApiClientProvider>;
}
