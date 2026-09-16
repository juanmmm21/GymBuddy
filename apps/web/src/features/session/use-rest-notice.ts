import type { ResourceId } from '@gymbuddy/shared';
import { useCallback, useEffect, useRef } from 'react';
import { useApiClient } from '../../api/provider';
import { usePushBrowser } from '../settings/PushBrowserProvider';
import { usePushNoticesEnabled } from '../settings/use-push-notices';
import {
  requestRestNotice,
  restNoticeKey,
  restNoticeRequestFor,
  withdrawRestNotice,
} from './rest-notice';

export interface RestNoticeSyncInput {
  readonly sessionId: ResourceId;
  readonly lastSetAt: string | null;
  readonly targetSeconds: number;
  readonly cardioStartedAt: string | null;
}

/** Si este dispositivo tiene el aviso encendido. Sin él no se programa nada desde aquí. */
function useRestNoticeEnabled(): boolean {
  return usePushNoticesEnabled(usePushBrowser()).data === true;
}

/**
 * Mantiene el aviso de fin de descanso del Worker igual que el temporizador de la pantalla (ADR
 * 0009): se programa al registrar una serie y se reprograma al cambiar el objetivo o el tipo de
 * descanso, porque todo eso mueve la hora a la que el cronómetro llega a 0:00. Si deja de haber
 * descanso (empieza un cardio, se borra la última serie) se quita el que se programó.
 *
 * Es un efecto porque sincroniza con un sistema de fuera, y lo que decide es la hora de fin y no la
 * pulsación que la cambió: así da igual si la serie llega directa o desde la cola offline. Volver
 * a la pantalla con el mismo descanso lo pide otra vez, y el Worker lo pisa con lo mismo.
 */
export function useRestNoticeSync({
  sessionId,
  lastSetAt,
  targetSeconds,
  cardioStartedAt,
}: RestNoticeSyncInput): void {
  const client = useApiClient();
  const enabled = useRestNoticeEnabled();
  // Lo último que se le pidió al Worker desde esta pantalla; `null` si nada o si se quitó.
  const scheduled = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const request = restNoticeRequestFor({
      sessionId,
      lastSetAt,
      targetSeconds,
      cardioStartedAt,
      now: Date.now(),
    });
    const key = restNoticeKey(request);
    if (key === scheduled.current) return;

    scheduled.current = key;
    if (request === null) {
      void withdrawRestNotice(client);
    } else {
      void requestRestNotice(client, request);
    }
  }, [enabled, client, sessionId, lastSetAt, targetSeconds, cardioStartedAt]);
}

/**
 * Quitar el aviso al terminar la sesión. Solo con el aviso encendido en este dispositivo; si lo
 * programó otro móvil, la alarma no manda nada porque la sesión ya no está abierta en el Worker.
 */
export function useWithdrawRestNotice(): () => void {
  const client = useApiClient();
  const enabled = useRestNoticeEnabled();

  return useCallback(() => {
    if (enabled) void withdrawRestNotice(client);
  }, [enabled, client]);
}
