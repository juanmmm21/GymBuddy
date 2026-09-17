import { z } from 'zod';
import { isoDatetimeSchema, resourceIdSchema } from './common';

/**
 * Qué clase de medio lleva un ejercicio propio: una foto o un vídeo de la técnica, los dos
 * re-codificados en el móvil antes de subirlos.
 */
export const exerciseMediaKindSchema = z.enum(['photo', 'video']);

export type ExerciseMediaKind = z.infer<typeof exerciseMediaKindSchema>;

/**
 * El formato en que viaja y se guarda cada clase. Uno solo por clase: la PWA re-codifica siempre
 * antes de subir, así que admitir más tipos solo abriría la puerta a subir el original del móvil.
 */
export const EXERCISE_MEDIA_CONTENT_TYPES = {
  photo: 'image/jpeg',
  video: 'video/mp4',
} as const satisfies Record<ExerciseMediaKind, string>;

/**
 * El tope por fichero que acepta el Worker. Una foto re-codificada a 1600 px ronda los 300–500 KB;
 * el margen cubre una foto con mucho detalle sin dejar pasar un original del iPhone. Un minuto de
 * vídeo a 2 Mbps ronda los 15 MB (en el iPhone de Juan, 48,8 s pesaron 11 MB): la tasa es variable y
 * se deja margen, pero un minuto en 4K de la cámara (unos 80 MB) no pasa.
 */
export const EXERCISE_MEDIA_MAX_BYTES = {
  photo: 3 * 1024 * 1024,
  video: 40 * 1024 * 1024,
} as const satisfies Record<ExerciseMediaKind, number>;

/** El lado largo de una foto al re-codificarla en el móvil: nítida en pantalla y ligera de subir. */
export const EXERCISE_PHOTO_MAX_EDGE_PIXELS = 1600;

/** La calidad JPEG de la re-codificación, entre 0 y 1. */
export const EXERCISE_PHOTO_JPEG_QUALITY = 0.82;

/**
 * El vídeo de la técnica se re-codifica en el móvil a 720p: el lado corto a 720 px como mucho y el
 * largo a 1280, para que un vídeo muy apaisado tampoco se dispare. Se ve bien en la ficha y pesa poco.
 */
export const EXERCISE_VIDEO_MAX_SHORT_EDGE_PIXELS = 720;

export const EXERCISE_VIDEO_MAX_LONG_EDGE_PIXELS = 1280;

/** Unos 2 Mbps en H.264: un minuto ronda los 15 MB, que se sube con poca cobertura. */
export const EXERCISE_VIDEO_BITRATE_BPS = 2_000_000;

/** Un vídeo de la técnica enseña unas pocas repeticiones: más de un minuto no se admite. */
export const EXERCISE_VIDEO_MAX_DURATION_SECONDS = 60;

/**
 * La foto o el vídeo de la técnica de un ejercicio propio. El `id` cambia con cada subida: la dirección del
 * fichero no se reutiliza nunca, así que se puede cachear para siempre.
 */
export const exerciseMediaSchema = z.object({
  id: resourceIdSchema,
  kind: exerciseMediaKindSchema,
  contentType: z.string().min(1),
  bytes: z.int().positive(),
  uploadedAt: isoDatetimeSchema,
});

export type ExerciseMedia = z.infer<typeof exerciseMediaSchema>;

/** La clase que corresponde a un `Content-Type` (sin mirar sus parámetros), o `null` si no se admite. */
export function exerciseMediaKindForContentType(contentType: string): ExerciseMediaKind | null {
  const bare = (contentType.split(';', 1)[0] ?? '').trim().toLowerCase();
  const match = exerciseMediaKindSchema.options.find(
    (kind) => EXERCISE_MEDIA_CONTENT_TYPES[kind] === bare,
  );

  return match ?? null;
}

/** La ruta (bajo `/api/v1`) desde la que se sirve un medio. La construyen el Worker y la PWA. */
export function exerciseMediaPath(exerciseId: string, mediaId: string): string {
  return `/exercises/${exerciseId}/media/${mediaId}`;
}
