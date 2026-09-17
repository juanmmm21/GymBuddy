import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { sessionShortcutFor } from '../../app/session-shortcut';
import { useStorage } from '../../app/StorageProvider';
import { useOpenSession } from '../../offline/use-open-session';
import {
  isTutorialVisible,
  loadTutorialSeen,
  saveTutorialSeen,
  type TutorialMode,
} from './tutorial';
import { TutorialOverlay } from './TutorialOverlay';

export interface TutorialControls {
  /** Volver a verlo desde Ajustes, ya se haya visto o no. */
  readonly show: () => void;
}

const TutorialContext = createContext<TutorialControls | null>(null);

export interface TutorialProviderProps {
  readonly children: ReactNode;
}

/**
 * Guarda si el tutorial está delante y ofrece abrirlo desde cualquier pantalla. No mira la sesión
 * en curso aquí a propósito: eso repintaría toda la app cada segundo con el cronómetro de
 * `useOpenSession`. Lo mira `TutorialSlot`, que es hermano de las pantallas y no las envuelve.
 */
export function TutorialProvider({ children }: TutorialProviderProps) {
  const storage = useStorage();
  const [seen, setSeen] = useState(() => loadTutorialSeen(storage));
  const [mode, setMode] = useState<TutorialMode>('auto');

  const show = useCallback(() => setMode('open'), []);
  // Saltarlo y terminarlo valen lo mismo: en los dos casos ya se sabe que está ahí.
  const close = useCallback(() => {
    setMode('closed');
    setSeen(true);
    saveTutorialSeen(storage);
  }, [storage]);

  const controls = useMemo<TutorialControls>(() => ({ show }), [show]);

  return (
    <TutorialContext.Provider value={controls}>
      {children}
      <TutorialSlot mode={mode} seen={seen} onClose={close} />
    </TutorialContext.Provider>
  );
}

interface TutorialSlotProps {
  readonly mode: TutorialMode;
  readonly seen: boolean;
  readonly onClose: () => void;
}

function TutorialSlot({ mode, seen, onClose }: TutorialSlotProps) {
  const open = useOpenSession();
  const hasOpenSession = sessionShortcutFor(open.data).kind === 'live';

  return (
    <TutorialOverlay open={isTutorialVisible({ mode, seen, hasOpenSession })} onClose={onClose} />
  );
}

export function useTutorial(): TutorialControls {
  const value = useContext(TutorialContext);
  if (value === null) {
    throw new Error('useTutorial solo puede usarse dentro de <TutorialProvider>');
  }
  return value;
}
