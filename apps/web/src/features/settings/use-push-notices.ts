import type { PushConfig } from '@gymbuddy/shared';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { fetchPushConfig } from '../../api/endpoints';
import { useApiClient } from '../../api/provider';
import { queryKeys, shouldRetryRequest } from '../../api/queries';
import {
  disablePushNotices,
  enablePushNotices,
  readPushNoticesEnabled,
  type EnablePushOutcome,
  type PushBrowser,
} from './push-notices';

/** La clave del servidor. Solo se pide donde el aviso se puede encender. */
export function usePushConfig(enabled: boolean): UseQueryResult<PushConfig> {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.push.config,
    queryFn: () => fetchPushConfig(client),
    retry: shouldRetryRequest,
    enabled,
  });
}

/** Si este dispositivo tiene el aviso encendido. Lo sabe el navegador, no el Worker. */
export function usePushNoticesEnabled(browser: PushBrowser | null): UseQueryResult<boolean> {
  return useQuery({
    queryKey: queryKeys.push.device,
    queryFn: () => (browser === null ? false : readPushNoticesEnabled(browser)),
    enabled: browser !== null,
    // No es una respuesta del servidor: no hay nada que reintentar ni que se quede viejo solo.
    retry: false,
    staleTime: Infinity,
  });
}

export interface EnablePushVariables {
  readonly publicKey: string;
  /** Pedido ya dentro del toque: ver `enablePushNotices`. */
  readonly permission: Promise<NotificationPermission>;
}

export function useEnablePushNotices(
  browser: PushBrowser | null,
): UseMutationResult<EnablePushOutcome, Error, EnablePushVariables> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ publicKey, permission }: EnablePushVariables) => {
      if (browser === null) throw new Error('Este navegador no puede recibir avisos');
      return enablePushNotices(browser, client, publicKey, permission);
    },
    // También tras un fallo: la suscripción pudo quedar a medias y el interruptor lee el navegador.
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.push.device }),
  });
}

export function useDisablePushNotices(
  browser: PushBrowser | null,
): UseMutationResult<void, Error, void> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => {
      if (browser === null) throw new Error('Este navegador no puede recibir avisos');
      return disablePushNotices(browser, client);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.push.device }),
  });
}
