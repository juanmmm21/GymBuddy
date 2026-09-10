import { createContext, useContext, type ReactNode } from 'react';
import type { StorageLike } from '../lib/storage';

const StorageContext = createContext<StorageLike | null>(null);

export interface StorageProviderProps {
  readonly storage: StorageLike;
  readonly children: ReactNode;
}

/**
 * El almacenamiento del dispositivo, el mismo que guarda la sesión de entrada. Llega por
 * contexto y no leyendo `window.localStorage` desde cada pantalla: así los tests montan la
 * app con uno en memoria y comprueban lo que quedó escrito.
 */
export function StorageProvider({ storage, children }: StorageProviderProps) {
  return <StorageContext.Provider value={storage}>{children}</StorageContext.Provider>;
}

export function useStorage(): StorageLike {
  const value = useContext(StorageContext);
  if (value === null) {
    throw new Error('useStorage solo puede usarse dentro de <StorageProvider>');
  }
  return value;
}
