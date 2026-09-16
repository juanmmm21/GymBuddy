import { createContext, useContext, type ReactNode } from 'react';
import type { PushBrowser } from './push-notices';

const PushBrowserContext = createContext<PushBrowser | null>(null);

export interface PushBrowserProviderProps {
  /** `null` en un navegador sin push, y en los tests que no simulan uno. */
  readonly browser: PushBrowser | null;
  readonly children: ReactNode;
}

/** Da a Ajustes el push del navegador, o el falso de los tests. */
export function PushBrowserProvider({ browser, children }: PushBrowserProviderProps) {
  return <PushBrowserContext.Provider value={browser}>{children}</PushBrowserContext.Provider>;
}

export function usePushBrowser(): PushBrowser | null {
  return useContext(PushBrowserContext);
}
