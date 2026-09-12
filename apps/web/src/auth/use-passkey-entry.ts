import type { Locale, Session } from '@gymbuddy/shared';
import { useCallback, useState } from 'react';
import { ApiRequestError, ApiTransportError } from '../api/client';
import {
  requestDeviceLinkOptions,
  requestLoginOptions,
  requestRegistrationOptions,
  verifyDeviceLink,
  verifyLogin,
  verifyRegistration,
} from '../api/endpoints';
import { useApiClient } from '../api/provider';
import { usePasskeyAuthenticator } from './AuthenticatorProvider';
import { PasskeyCeremonyError } from './passkey-authenticator';
import { useSession } from './SessionProvider';

export type EntryCeremony = 'login' | 'registration' | 'device_link';

export type EntryFailure =
  | 'cancelled'
  | 'unsupported'
  | 'invitation_invalid'
  | 'device_link_invalid'
  | 'passkey_invalid'
  | 'offline'
  | 'unexpected';

export type EntryState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'working'; readonly ceremony: EntryCeremony }
  | {
      readonly phase: 'failed';
      readonly ceremony: EntryCeremony;
      readonly reason: EntryFailure;
    };

/** Lo que el formulario de invitación ya validó con el contrato. */
export interface RegistrationInput {
  readonly invitationCode: string;
  readonly displayName: string;
}

export interface PasskeyEntry {
  readonly state: EntryState;
  readonly signIn: () => void;
  readonly register: (input: RegistrationInput) => void;
  /** Suma este dispositivo a una cuenta que ya existe, con el código pedido desde el otro. */
  readonly linkDevice: (linkCode: string) => void;
  /** Olvida el último fallo, al cambiar entre entrar y registrarse. */
  readonly reset: () => void;
}

/**
 * Entrar y registrarse con passkey. Las dos ceremonias son el mismo baile de tres pasos —pedir
 * las opciones al Worker, que el móvil cree o use la llave, y verificar— y acaban igual: con la
 * sesión abierta, que es lo que saca a la persona de la pantalla de entrada.
 *
 * Las opciones se piden al pulsar y no antes: son un reto de un solo uso que caduca, y pedirlo al
 * abrir la pantalla dejaría una fila en la base por cada visita.
 */
export function usePasskeyEntry(locale: Locale): PasskeyEntry {
  const client = useApiClient();
  const authenticator = usePasskeyAuthenticator();
  const { signIn: openSession } = useSession();
  const [state, setState] = useState<EntryState>({ phase: 'idle' });

  const run = useCallback(
    (ceremony: EntryCeremony, work: () => Promise<Session>): void => {
      if (!authenticator.isSupported()) {
        setState({ phase: 'failed', ceremony, reason: 'unsupported' });
        return;
      }

      setState({ phase: 'working', ceremony });
      work()
        .then((session) => {
          // Abrir la sesión desmonta esta pantalla: no queda estado que tocar después.
          openSession(session);
        })
        .catch((error: unknown) => {
          const reason = entryFailureOf(error);
          if (reason === 'unexpected') console.error('La entrada con passkey falló', error);
          setState({ phase: 'failed', ceremony, reason });
        });
    },
    [authenticator, openSession],
  );

  const signIn = useCallback((): void => {
    run('login', async () => {
      const { challengeId, options } = await requestLoginOptions(client);
      const credential = await authenticator.get(options);
      return verifyLogin(client, { challengeId, credential });
    });
  }, [authenticator, client, run]);

  const register = useCallback(
    (input: RegistrationInput): void => {
      run('registration', async () => {
        const { challengeId, options } = await requestRegistrationOptions(client, {
          invitationCode: input.invitationCode,
          displayName: input.displayName,
          locale,
        });
        const credential = await authenticator.create(options);
        return verifyRegistration(client, { challengeId, credential });
      });
    },
    [authenticator, client, locale, run],
  );

  const linkDevice = useCallback(
    (linkCode: string): void => {
      run('device_link', async () => {
        const { challengeId, options } = await requestDeviceLinkOptions(client, { linkCode });
        const credential = await authenticator.create(options);
        return verifyDeviceLink(client, { challengeId, credential });
      });
    },
    [authenticator, client, run],
  );

  const reset = useCallback((): void => {
    setState({ phase: 'idle' });
  }, []);

  return { state, signIn, register, linkDevice, reset };
}

/** El motivo que la pantalla explica, a partir de lo que falló en el navegador o en el Worker. */
export function entryFailureOf(error: unknown): EntryFailure {
  if (error instanceof PasskeyCeremonyError) {
    return error.reason === 'failed' ? 'unexpected' : error.reason;
  }
  if (error instanceof ApiTransportError) return 'offline';
  if (
    error instanceof ApiRequestError &&
    (error.code === 'invitation_invalid' ||
      error.code === 'device_link_invalid' ||
      error.code === 'passkey_invalid')
  ) {
    return error.code;
  }

  return 'unexpected';
}
