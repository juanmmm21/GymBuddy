import { z } from 'zod';
import { isoDatetimeSchema, resourceIdSchema } from './common';

/**
 * Qué clase de medio lleva un ejercicio propio. De momento solo fotos: el vídeo necesita
 * re-codificarse en el móvil antes de subirlo y llega en una porción aparte.
 */
export const exerciseMediaKindSchema = z.enum(['photo']);

export type ExerciseMediaKind = z.infer<typeof exerciseMediaKindSchema>;

/**
 * El formato en que viaja y se guarda cada clase. Uno solo por clase: la PWA re-codifica siempre
 * antes de subir, así que admitir más tipos solo abriría la puerta a subir el original del móvil.
 */
export const EXERCISE_MEDIA_CONTENT_TYPES = {
  photo: 'image/jpeg',
} as const satisfies Record<ExerciseMediaKind, string>;

/**
 * El tope por fichero que acepta el Worker. Una foto re-codificada a 1600 px ronda los 300–500 KB;
 * el margen cubre una foto con mucho detalle sin dejar pasar un original del iPhone.
 */
export const EXERCISE_MEDIA_MAX_BYTES = {
  photo: 3 * 1024 * 1024,
} as const satisfies Record<ExerciseMediaKind, number>;

/** El lado largo de una foto al re-codificarla en el móvil: nítida en pantalla y ligera de subir. */
export const EXERCISE_PHOTO_MAX_EDGE_PIXELS = 1600;

/** La calidad JPEG de la re-codificación, entre 0 y 1. */
export const EXERCISE_PHOTO_JPEG_QUALITY = 0.82;

/**
 * La foto de la técnica de un ejercicio propio. El `id` cambia con cada subida: la dirección del
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
