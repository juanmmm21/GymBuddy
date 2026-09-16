import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import type { InstallPrompt, InstallPromptOutcome, InstallPromptState } from './install-prompt';
import {
  detectInstallSituation,
  detectPlatform,
  type BrowserEnvironment,
  type DevicePlatform,
  type InstallSituation,
} from './platform';

/** El entorno leído al arrancar y el diálogo capturado antes de montar React. */
export interface InstallSupport {
  readonly environment: BrowserEnvironment;
  readonly prompt: InstallPrompt;
}

const InstallContext = createContext<InstallSupport | null>(null);

export interface InstallProviderProps {
  readonly support: InstallSupport;
  readonly children: ReactNode;
}

/** Llega por contexto para que los tests monten la app como un iPhone o dentro de Instagram. */
export function InstallProvider({ support, children }: InstallProviderProps) {
  return <InstallContext.Provider value={support}>{children}</InstallContext.Provider>;
}

export interface InstallGuide {
  readonly situation: InstallSituation;
  /** iPhone, Android o escritorio, esté o no instalada: lo usan también las funciones propias de iOS. */
  readonly platform: DevicePlatform;
  readonly promptState: InstallPromptState;
  readonly openPrompt: () => Promise<InstallPromptOutcome>;
  readonly appUrl: string;
}

export function useInstallGuide(): InstallGuide {
  const support = useContext(InstallContext);
  if (support === null) {
    throw new Error('useInstallGuide solo puede usarse dentro de <InstallProvider>');
  }
  const { environment, prompt } = support;

  const promptState = useSyncExternalStore(prompt.subscribe, prompt.getState);
  const situation = useMemo(() => detectInstallSituation(environment), [environment]);
  const platform = useMemo(() => detectPlatform(environment), [environment]);

  return {
    situation,
    platform,
    promptState,
    openPrompt: prompt.prompt,
    appUrl: environment.appUrl,
  };
}
