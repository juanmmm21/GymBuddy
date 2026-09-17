import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { MEDIA_FILE_BUDGET_BYTES, type MediaFileCache } from './media-file-cache';
import type { MediaFileStore } from './media-file-store';

const MediaFileCacheContext = createContext<MediaFileCache | null>(null);

export interface MediaFileCacheProviderProps {
  readonly store: MediaFileStore;
  readonly children: ReactNode;
}

/** Da a la ficha y a las subidas dónde se guardan las fotos y los vídeos para verlos sin red. */
export function MediaFileCacheProvider({ store, children }: MediaFileCacheProviderProps) {
  const cache = useMemo<MediaFileCache>(
    () => ({ store, now: () => new Date(), budgetBytes: MEDIA_FILE_BUDGET_BYTES }),
    [store],
  );
  return <MediaFileCacheContext.Provider value={cache}>{children}</MediaFileCacheContext.Provider>;
}

export function useMediaFileCache(): MediaFileCache {
  const cache = useContext(MediaFileCacheContext);
  if (cache === null) {
    throw new Error('useMediaFileCache necesita un MediaFileCacheProvider por encima');
  }
  return cache;
}
