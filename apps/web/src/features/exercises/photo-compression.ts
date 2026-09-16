import {
  EXERCISE_MEDIA_CONTENT_TYPES,
  EXERCISE_MEDIA_MAX_BYTES,
  EXERCISE_PHOTO_JPEG_QUALITY,
  EXERCISE_PHOTO_MAX_EDGE_PIXELS,
} from '@gymbuddy/shared';

export interface PhotoSize {
  readonly width: number;
  readonly height: number;
}

/** Una foto ya decodificada en el móvil, lista para redibujarla. `close` libera su memoria. */
export interface DecodedPhoto extends PhotoSize {
  close(): void;
}

/**
 * Lo que el navegador pone para re-codificar: decodificar el fichero elegido (HEIC incluido, ya
 * girado según su EXIF) y dibujarlo a otro tamaño como JPEG. Es un puerto para que la lógica se
 * pruebe sin canvas, que jsdom no tiene.
 */
export interface PhotoCodec {
  decode(file: Blob): Promise<DecodedPhoto>;
  encodeJpeg(photo: DecodedPhoto, size: PhotoSize, quality: number): Promise<Blob>;
}

export type PhotoCompressionFailure = 'unreadable' | 'too_large';

export class PhotoCompressionError extends Error {
  readonly reason: PhotoCompressionFailure;

  constructor(reason: PhotoCompressionFailure, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'PhotoCompressionError';
    this.reason = reason;
  }
}

/**
 * El tamaño al que se redibuja: el lado largo a `maxEdge` como mucho, sin deformar y sin agrandar
 * nunca una foto pequeña. Los píxeles son enteros y al menos uno por lado.
 */
export function photoTargetSize(source: PhotoSize, maxEdge: number): PhotoSize {
  const longest = Math.max(source.width, source.height);
  if (longest <= maxEdge) return { width: source.width, height: source.height };

  const scale = maxEdge / longest;

  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  };
}

/**
 * Re-codifica la foto elegida antes de subirla: una del iPhone pesa varios MB y el Worker solo
 * acepta el JPEG ya reducido. Falla con `PhotoCompressionError` si el navegador no sabe leerla o si,
 * aun reducida, pasa del tope.
 */
export async function compressPhoto(file: Blob, codec: PhotoCodec): Promise<Blob> {
  let decoded: DecodedPhoto;
  try {
    decoded = await codec.decode(file);
  } catch (error) {
    throw new PhotoCompressionError('unreadable', 'El móvil no pudo leer esa foto', {
      cause: error,
    });
  }

  let encoded: Blob;
  try {
    encoded = await codec.encodeJpeg(
      decoded,
      photoTargetSize(decoded, EXERCISE_PHOTO_MAX_EDGE_PIXELS),
      EXERCISE_PHOTO_JPEG_QUALITY,
    );
  } catch (error) {
    throw new PhotoCompressionError('unreadable', 'El móvil no pudo preparar esa foto', {
      cause: error,
    });
  } finally {
    decoded.close();
  }

  if (encoded.size > EXERCISE_MEDIA_MAX_BYTES.photo) {
    throw new PhotoCompressionError('too_large', 'La foto sigue pesando demasiado');
  }

  // El tipo se fija aquí y no se fía del codificador: el Worker decide por `Content-Type`.
  return encoded.type === EXERCISE_MEDIA_CONTENT_TYPES.photo
    ? encoded
    : new Blob([encoded], { type: EXERCISE_MEDIA_CONTENT_TYPES.photo });
}
