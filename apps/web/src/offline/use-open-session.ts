import type { ActiveSessionResponse } from '@gymbuddy/shared';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useNow } from '../hooks/use-now';
import { fetchActiveSession } from '../api/endpoints';
import { useApiClient } from '../api/provider';
import { queryKeys, shouldRetryRequest } from '../api/queries';
import { applyPendingWrites, withoutIdleSession, type SessionWithPendingWrites } from './overlay';
import { useUserWriteQueue } from './WriteQueueProvider';

const MILLISECONDS_PER_MINUTE = 60_000;

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
  // Al minuto basta, y así el `select` no se rehace cada segundo. Se redondea hacia arriba: como
  // mucho la sesión se da por cerrada un minuto antes que en el Worker, nunca después, así que no
  // se ofrece apuntar en ella una serie que el Worker ya rechazaría.
  const minute = Math.floor(useNow() / MILLISECONDS_PER_MINUTE);
  const select = useCallback(
    (data: ActiveSessionResponse) =>
      withoutIdleSession(
        applyPendingWrites(data.session, writes),
        new Date(minute * MILLISECONDS_PER_MINUTE + MILLISECONDS_PER_MINUTE),
      ),
    [writes, minute],
  );

  return useQuery({
    queryKey: queryKeys.sessions.active,
    queryFn: () => fetchActiveSession(client),
    select,
    retry: shouldRetryRequest,
  });
}
