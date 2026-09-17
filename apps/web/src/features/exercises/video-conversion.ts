import {
  EXERCISE_MEDIA_CONTENT_TYPES,
  EXERCISE_MEDIA_MAX_BYTES,
  EXERCISE_VIDEO_BITRATE_BPS,
  EXERCISE_VIDEO_MAX_DURATION_SECONDS,
  EXERCISE_VIDEO_MAX_LONG_EDGE_PIXELS,
  EXERCISE_VIDEO_MAX_SHORT_EDGE_PIXELS,
} from '@gymbuddy/shared';

export interface VideoSize {
  readonly width: number;
  readonly height: number;
}

/** Lo que se lee de un vídeo antes de convertirlo: su tamaño en pantalla (ya girado) y su duración. */
export interface VideoProbe extends VideoSize {
  readonly durationSeconds: number;
  /** El códec de la pista de vídeo (`hevc`, `avc`…), o `null` si el contenedor no lo dice. */
  readonly codec: string | null;
}

/** Cómo se re-codifica: H.264 sin sonido al tamaño y la tasa de bits indicados. */
export interface VideoEncodePlan extends VideoSize {
  readonly bitrate: number;
}

/**
 * Lo que el navegador pone para convertir un vídeo: leerlo y re-codificarlo. Es un puerto para que la
 * lógica se pruebe sin WebCodecs, que jsdom no tiene. `probe` da `null` si el fichero no lleva vídeo.
 */
export interface VideoConverter {
  probe(file: Blob): Promise<VideoProbe | null>;
  convert(file: Blob, plan: VideoEncodePlan, onProgress: (fraction: number) => void): Promise<Blob>;
}

export type VideoConversionFailure =
  'unreadable' | 'no_video' | 'too_long' | 'too_large' | 'failed';

export class VideoConversionError extends Error {
  readonly reason: VideoConversionFailure;

  constructor(reason: VideoConversionFailure, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'VideoConversionError';
    this.reason = reason;
  }
}

/** El vídeo convertido con sus medidas. */
export interface VideoConversionResult {
  readonly video: Blob;
  readonly source: VideoProbe;
  readonly target: VideoSize;
  readonly elapsedMs: number;
}

export interface ConvertVideoOptions {
  readonly onProgress?: (fraction: number) => void;
  /** El reloj en milisegundos; los tests lo fijan. */
  readonly now?: () => number;
}

/**
 * El tamaño al que se re-codifica: el lado corto y el largo dentro de sus topes, sin deformar y sin
 * agrandar nunca un vídeo pequeño. Los lados salen PARES porque H.264 con submuestreo 4:2:0 no admite
 * impares, y al menos dos píxeles cada uno.
 */
export function videoTargetSize(source: VideoSize): VideoSize {
  const shortest = Math.min(source.width, source.height);
  const longest = Math.max(source.width, source.height);
  const scale = Math.min(
    1,
    EXERCISE_VIDEO_MAX_SHORT_EDGE_PIXELS / shortest,
    EXERCISE_VIDEO_MAX_LONG_EDGE_PIXELS / longest,
  );

  return {
    width: evenPixels(source.width * scale),
    height: evenPixels(source.height * scale),
  };
}

function evenPixels(value: number): number {
  return Math.max(2, Math.floor(value / 2) * 2);
}

/**
 * Re-codifica en el móvil el vídeo elegido a 720p, H.264 y sin sonido. Falla con
 * `VideoConversionError` si el navegador no sabe leerlo, si no lleva vídeo, si pasa del minuto, si la
 * conversión se rompe a medias o si lo convertido sigue pasando del tope del Worker; en ningún caso se
 * devuelve el original.
 */
export async function convertVideo(
  file: Blob,
  converter: VideoConverter,
  options: ConvertVideoOptions = {},
): Promise<VideoConversionResult> {
  const now = options.now ?? (() => performance.now());
  const startedAt = now();

  let source: VideoProbe | null;
  try {
    source = await converter.probe(file);
  } catch (error) {
    throw new VideoConversionError('unreadable', 'El móvil no pudo leer ese vídeo', {
      cause: error,
    });
  }
  if (source === null) {
    throw new VideoConversionError('no_video', 'El fichero no lleva vídeo');
  }
  if (source.durationSeconds > EXERCISE_VIDEO_MAX_DURATION_SECONDS) {
    throw new VideoConversionError('too_long', 'El vídeo pasa del minuto');
  }

  const target = videoTargetSize(source);
  let video: Blob;
  try {
    video = await converter.convert(
      file,
      { ...target, bitrate: EXERCISE_VIDEO_BITRATE_BPS },
      (fraction) => options.onProgress?.(Math.min(1, Math.max(0, fraction))),
    );
  } catch (error) {
    throw new VideoConversionError('failed', 'El móvil no pudo convertir ese vídeo', {
      cause: error,
    });
  }

  if (video.size > EXERCISE_MEDIA_MAX_BYTES.video) {
    throw new VideoConversionError('too_large', 'El vídeo convertido sigue pesando demasiado');
  }

  // El tipo se fija aquí y no se fía del conversor: el Worker decide por `Content-Type`.
  const typed =
    video.type === EXERCISE_MEDIA_CONTENT_TYPES.video
      ? video
      : new Blob([video], { type: EXERCISE_MEDIA_CONTENT_TYPES.video });

  return { video: typed, source, target, elapsedMs: Math.max(0, now() - startedAt) };
}
