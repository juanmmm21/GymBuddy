import type { ActiveSessionResponse } from '@gymbuddy/shared';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { fetchActiveSession } from '../api/endpoints';
import { useApiClient } from '../api/provider';
import { queryKeys, shouldRetryRequest } from '../api/queries';
import { applyPendingWrites, type SessionWithPendingWrites } from './overlay';
import { useUserWriteQueue } from './WriteQueueProvider';

/**
 * La sesión en curso tal y como la ve quien entrena: la de `GET /sessions/active` con lo que
 * espera en la cola encima. Comparte la clave de caché con `useActiveSession`, así que lo que
 * invalida una escritura la refresca igual; la cola se aplica en el `select`, que se recalcula
 * cada vez que la cola cambia sin volver a pedir nada al Worker.
 */
export function useOpenSession(): UseQueryResult<SessionWithPendingWrites> {
  const client = useApiClient();
  const { pending } = useUserWriteQueue();
  const writes = useMemo(() => pending.map((entry) => entry.write), [pending]);
  const select = useCallback(
    (data: ActiveSessionResponse) => applyPendingWrites(data.session, writes),
    [writes],
  );

  return useQuery({
    queryKey: queryKeys.sessions.active,
    queryFn: () => fetchActiveSession(client),
    select,
    retry: shouldRetryRequest,
  });
}
