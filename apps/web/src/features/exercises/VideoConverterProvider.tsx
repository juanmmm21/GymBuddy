import { createContext, useContext, type ReactNode } from 'react';
import type { VideoConverter } from './video-conversion';

const VideoConverterContext = createContext<VideoConverter | null>(null);

export interface VideoConverterProviderProps {
  /** `null` en un navegador sin WebCodecs, y en los tests que no simulan uno. */
  readonly converter: VideoConverter | null;
  readonly children: ReactNode;
}

/** Da el conversor de vídeo del navegador, o el falso de los tests. */
export function VideoConverterProvider({ converter, children }: VideoConverterProviderProps) {
  return (
    <VideoConverterContext.Provider value={converter}>{children}</VideoConverterContext.Provider>
  );
}

export function useVideoConverter(): VideoConverter | null {
  return useContext(VideoConverterContext);
}
