import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiTransportError } from '../api/client';
import { claimSession, requestLoginNonce } from '../api/endpoints';
import { useApiClient } from '../api/provider';
import { claimWithBackoff } from './claim-with-backoff';
import { useSession } from './SessionProvider';

export type LoginFailure = 'expired' | 'invalid' | 'offline' | 'unexpected';

export type LoginState =
  | { readonly phase: 'idle' }
  /** Pidiendo el nonce al Worker. */
  | { readonly phase: 'requesting' }
  /** Enlace listo y canje en marcha: falta que el usuario pulse Start en Telegram. */
  | { readonly phase: 'waiting'; readonly telegramLink: string }
  | { readonly phase: 'failed'; readonly reason: LoginFailure };

export interface TelegramLogin {
  readonly state: LoginState;
  /** Pide un enlace nuevo y empieza a esperar. También sirve para reintentar. */
  readonly start: () => void;
}

/**
 * La entrada por el enlace del bot en tres pasos: nonce, enlace abierto por el usuario y
 * canje sondeado con backoff. El enlace no se abre desde código: `window.open` tras un
 * `await` lo bloquea el navegador por no venir de un gesto, así que se pinta como un `<a>`.
 */
export function useTelegramLogin(): TelegramLogin {
  const client = useApiClient();
  const { signIn } = useSession();
  const [state, setState] = useState<LoginState>({ phase: 'idle' });
  const abortRef = useRef<AbortController | null>(null);

  const cancelPending = useCallback((): void => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  useEffect(() => cancelPending, [cancelPending]);

  const start = useCallback((): void => {
    cancelPending();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ phase: 'requesting' });

    const run = async (): Promise<void> => {
      const nonce = await requestLoginNonce(client);
      if (controller.signal.aborted) return;
      setState({ phase: 'waiting', telegramLink: nonce.telegramLink });

      const outcome = await claimWithBackoff({
        claim: () => claimSession(client, { nonce: nonce.nonce }),
        expiresAt: nonce.expiresAt,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;

      switch (outcome.status) {
        case 'ready':
          signIn(outcome.session);
          setState({ phase: 'idle' });
          return;
        case 'expired':
          setState({ phase: 'failed', reason: 'expired' });
          return;
        case 'invalid':
          setState({ phase: 'failed', reason: 'invalid' });
          return;
        case 'aborted':
          return;
      }
    };

    run().catch((error: unknown) => {
      if (controller.signal.aborted) return;
      console.error('La entrada por Telegram falló', error);
      setState({
        phase: 'failed',
        reason: error instanceof ApiTransportError ? 'offline' : 'unexpected',
      });
    });
  }, [cancelPending, client, signIn]);

  return { state, start };
}
