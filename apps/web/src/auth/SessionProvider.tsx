import type { Session } from '@gymbuddy/shared';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  clearStoredSession,
  loadStoredSession,
  saveStoredSession,
  type SessionStorageLike,
} from './session-store';

export interface SessionContextValue {
  readonly session: Session | null;
  readonly signIn: (session: Session) => void;
  readonly signOut: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export interface SessionProviderProps {
  readonly storage: SessionStorageLike;
  readonly children: ReactNode;
  /** Sesión inicial para los tests; en la app sale del almacenamiento. */
  readonly initialSession?: Session | null;
}

/**
 * Mantiene la sesión en memoria y la refleja en el almacenamiento. Es un estado de React
 * y no una variable suelta porque cerrar sesión tiene que volver a pintar la app entera.
 */
export function SessionProvider({ storage, children, initialSession }: SessionProviderProps) {
  const [session, setSession] = useState<Session | null>(
    () => initialSession ?? loadStoredSession(storage, new Date()),
  );

  const signIn = useCallback(
    (next: Session): void => {
      saveStoredSession(storage, next);
      setSession(next);
    },
    [storage],
  );

  const signOut = useCallback((): void => {
    clearStoredSession(storage);
    setSession(null);
  }, [storage]);

  const value = useMemo<SessionContextValue>(
    () => ({ session, signIn, signOut }),
    [session, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (value === null) {
    throw new Error('useSession solo puede usarse dentro de <SessionProvider>');
  }
  return value;
}
