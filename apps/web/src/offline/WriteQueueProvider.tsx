import type { ResourceId } from '@gymbuddy/shared';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { ApiClient } from '../api/client';
import { useSession } from '../auth/SessionProvider';
import type { PendingWrite } from './pending-write';
import { sendSessionWrite } from './send-write';
import type { DrainReport, DroppedWrite, WriteQueue } from './write-queue';

const WriteQueueContext = createContext<WriteQueue | null>(null);

export interface WriteQueueProviderProps {
  readonly queue: WriteQueue;
  readonly children: ReactNode;
}

/** La cola es una sola por app: la comparten todas las pantallas y sobrevive a renovar el token. */
export function WriteQueueProvider({ queue, children }: WriteQueueProviderProps) {
  return <WriteQueueContext.Provider value={queue}>{children}</WriteQueueContext.Provider>;
}

export function useWriteQueue(): WriteQueue {
  const queue = useContext(WriteQueueContext);
  if (queue === null) {
    throw new Error('useWriteQueue solo puede usarse dentro de <WriteQueueProvider>');
  }
  return queue;
}

/** Lo que espera y lo que se descartó, solo de la cuenta con sesión en este dispositivo. */
export interface UserWriteQueue {
  readonly pending: readonly PendingWrite[];
  readonly dropped: readonly DroppedWrite[];
}

const EMPTY_USER_QUEUE: UserWriteQueue = { pending: [], dropped: [] };

export function useUserWriteQueue(): UserWriteQueue {
  const queue = useWriteQueue();
  const snapshot = useSyncExternalStore(queue.subscribe, queue.getSnapshot);
  const userId = useSession().session?.user.id ?? null;

  return useMemo(
    () =>
      userId === null
        ? EMPTY_USER_QUEUE
        : {
            pending: snapshot.pending.filter((entry) => entry.userId === userId),
            dropped: snapshot.dropped.filter((dropped) => dropped.userId === userId),
          },
    [snapshot, userId],
  );
}

/**
 * Cada cuánto se vuelve a intentar con algo pendiente. El evento `online` no basta: en un
 * gimnasio el móvil suele creerse conectado con una barra que no deja pasar nada, y ahí el
 * navegador nunca avisa de que la red ha vuelto.
 */
export const DRAIN_RETRY_INTERVAL_MS = 30_000;

export interface QueueDrainerOptions {
  readonly client: ApiClient;
  readonly userId: ResourceId | null;
  readonly onSettled: (report: DrainReport) => void;
}

/**
 * Conecta la cola a la cuenta con sesión y la drena al abrir la app, al volver la red, al volver
 * a la app desde otra y cada poco mientras quede algo. Son suscripciones a sistemas externos, no
 * estado de React: por eso van en un efecto.
 */
export function useQueueDrainer({ client, userId, onSettled }: QueueDrainerOptions): void {
  const queue = useWriteQueue();

  useEffect(() => {
    if (userId === null) return undefined;

    const disconnect = queue.connect({
      userId,
      send: (write) => sendSessionWrite(client, write),
      onSettled,
    });
    const drain = (): void => {
      void queue.drain();
    };
    const drainWhenVisible = (): void => {
      if (document.visibilityState === 'visible') drain();
    };
    const retry = setInterval(() => {
      if (queue.getSnapshot().pending.some((entry) => entry.userId === userId)) drain();
    }, DRAIN_RETRY_INTERVAL_MS);

    window.addEventListener('online', drain);
    document.addEventListener('visibilitychange', drainWhenVisible);
    drain();

    return () => {
      clearInterval(retry);
      window.removeEventListener('online', drain);
      document.removeEventListener('visibilitychange', drainWhenVisible);
      disconnect();
    };
  }, [client, onSettled, queue, userId]);
}
