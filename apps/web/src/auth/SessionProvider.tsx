import type { Session, SessionRefresh, User } from '@gymbuddy/shared';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { StorageLike } from '../lib/storage';
import { clearStoredSession, loadStoredSession, saveStoredSession } from './session-store';

export interface SessionContextValue {
  readonly session: Session | null;
  readonly signIn: (session: Session) => void;
  readonly signOut: () => void;
  /** El Worker mandó un token nuevo para la misma cuenta: se guarda sin tocar nada más. */
  readonly renew: (refresh: SessionRefresh) => void;
  /** El perfil cambió en el Worker: mismo token, usuario nuevo. */
  readonly updateUser: (user: User) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export interface SessionProviderProps {
  readonly storage: StorageLike;
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

  /**
   * Renovar es cambiar el token de la sesión que ya hay, no abrir otra: el usuario es el mismo
   * y no viaja en las cabeceras. Se compara el token porque dos peticiones que salen a la vez
   * pueden traer cada una el suyo, y repintar la app por el segundo no aporta nada.
   */
  const renew = useCallback(
    (refresh: SessionRefresh): void => {
      if (session === null || session.token === refresh.token) return;

      const next: Session = { ...session, ...refresh };
      saveStoredSession(storage, next);
      setSession(next);
    },
    [session, storage],
  );

  /**
   * Solo si es la misma cuenta: una respuesta que llega tras salir y entrar con otra no puede
   * colarle a esta el nombre de la anterior.
   */
  const updateUser = useCallback(
    (user: User): void => {
      if (session?.user.id !== user.id) return;

      const next: Session = { ...session, user };
      saveStoredSession(storage, next);
      setSession(next);
    },
    [session, storage],
  );

  const value = useMemo<SessionContextValue>(
    () => ({ session, signIn, signOut, renew, updateUser }),
    [session, signIn, signOut, renew, updateUser],
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
