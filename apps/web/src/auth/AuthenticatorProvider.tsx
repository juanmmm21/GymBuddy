import { createContext, useContext, type ReactNode } from 'react';
import { browserPasskeyAuthenticator, type PasskeyAuthenticator } from './passkey-authenticator';

const AuthenticatorContext = createContext<PasskeyAuthenticator>(browserPasskeyAuthenticator);

export interface AuthenticatorProviderProps {
  readonly authenticator: PasskeyAuthenticator;
  readonly children: ReactNode;
}

/** Da a la entrada el autenticador del navegador, o el falso de los tests. */
export function AuthenticatorProvider({ authenticator, children }: AuthenticatorProviderProps) {
  return (
    <AuthenticatorContext.Provider value={authenticator}>{children}</AuthenticatorContext.Provider>
  );
}

export function usePasskeyAuthenticator(): PasskeyAuthenticator {
  return useContext(AuthenticatorContext);
}
