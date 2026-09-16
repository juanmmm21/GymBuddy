import { createContext, useContext, type ReactNode } from 'react';
import type { PhotoCodec } from './photo-compression';

const PhotoCodecContext = createContext<PhotoCodec | null>(null);

export interface PhotoCodecProviderProps {
  /** `null` en un navegador que no sabe re-codificar fotos, y en los tests que no simulan uno. */
  readonly codec: PhotoCodec | null;
  readonly children: ReactNode;
}

/** Da a la ficha del ejercicio el codificador de fotos del navegador, o el falso de los tests. */
export function PhotoCodecProvider({ codec, children }: PhotoCodecProviderProps) {
  return <PhotoCodecContext.Provider value={codec}>{children}</PhotoCodecContext.Provider>;
}

export function usePhotoCodec(): PhotoCodec | null {
  return useContext(PhotoCodecContext);
}
