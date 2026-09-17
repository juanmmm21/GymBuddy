import {
  EXERCISE_MEDIA_CONTENT_TYPES,
  EXERCISE_MEDIA_MAX_BYTES,
  exerciseMediaKindForContentType,
  type ExerciseMediaKind,
  type Locale,
  type TrackedExercise,
} from '@gymbuddy/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { exerciseMedia, mediaUploadMonth, trackedExercise } from '../db/schema';
import { ApiException } from '../http/errors';
import { exerciseNotFound, findTrackedExercise } from './exercises';

/**
 * El espacio que pueden ocupar entre todas las cuentas. El gratuito de R2 da 10 GB-mes a la cuenta
 * de Cloudflare entera y pasarse cobra: se deja la mitad de margen para ficheros huérfanos (un
 * borrado en R2 que falló) y para lo que llegue a la vez que se comprueba.
 */
export const MEDIA_STORAGE_BUDGET_BYTES = 5 * 1024 * 1024 * 1024;

/**
 * Subidas al mes entre todas las cuentas. Cada una es una operación de clase A y el gratuito da un
 * millón; el tope está tan abajo para que ni un bucle de reintentos de la PWA se acerque.
 */
export const MEDIA_MONTHLY_UPLOAD_LIMIT = 3_000;

/** Lo que el Worker sabe de un fichero antes de leer un solo byte. */
export interface MediaUploadHeaders {
  readonly contentType: string | undefined;
  readonly contentLength: string | undefined;
}

export interface AcceptedMediaUpload {
  readonly kind: ExerciseMediaKind;
  readonly contentType: string;
  readonly bytes: number;
}

/** La clave en R2. Cuelga de la cuenta para poder localizar lo de una persona sin pasar por D1. */
export function mediaObjectKey(userId: string, mediaId: string): string {
  return `exercise-media/${userId}/${mediaId}`;
}

/** El mes de las subidas (`YYYY-MM`) en UTC, como lo cuenta Cloudflare. */
export function uploadMonth(now: Date): string {
  return now.toISOString().slice(0, 7);
}

/**
 * Decide por las cabeceras si el fichero se acepta. La longitud es obligatoria: R2 necesita saberla
 * para guardar un cuerpo que llega en streaming, y es lo que permite rechazar uno enorme sin leerlo.
 */
export function acceptMediaUpload(headers: MediaUploadHeaders): AcceptedMediaUpload {
  const kind =
    headers.contentType === undefined ? null : exerciseMediaKindForContentType(headers.contentType);
  if (kind === null) {
    throw new ApiException('validation_failed', 'Solo se admiten fotos en JPEG y vídeos en MP4', {
      contentType: headers.contentType ?? null,
    });
  }

  const bytes = headers.contentLength === undefined ? Number.NaN : Number(headers.contentLength);
  if (!Number.isSafeInteger(bytes) || bytes <= 0) {
    throw new ApiException('validation_failed', 'Falta el tamaño del fichero o está vacío');
  }

  const maxBytes = EXERCISE_MEDIA_MAX_BYTES[kind];
  if (bytes > maxBytes) {
    throw new ApiException('media_too_large', 'El fichero pesa demasiado', { bytes, maxBytes });
  }

  return { kind, contentType: EXERCISE_MEDIA_CONTENT_TYPES[kind], bytes };
}

interface MediaTarget {
  readonly catalogId: string | null;
  readonly mediaId: string | null;
  readonly mediaBytes: number | null;
}

async function findMediaTarget(
  db: Database,
  userId: string,
  exerciseId: string,
): Promise<MediaTarget> {
  const [row] = await db
    .select({
      catalogId: trackedExercise.catalogId,
      mediaId: exerciseMedia.mediaId,
      mediaBytes: exerciseMedia.bytes,
    })
    .from(trackedExercise)
    .leftJoin(exerciseMedia, eq(exerciseMedia.trackedExerciseId, trackedExercise.id))
    .where(and(eq(trackedExercise.id, exerciseId), eq(trackedExercise.userId, userId)))
    .limit(1);

  if (row === undefined) throw exerciseNotFound(exerciseId);

  return row;
}

/**
 * Se niega antes de escribir nada en R2 si la subida sacaría la cuenta del gratuito. El medio que se
 * sustituye no cuenta: se borra en cuanto la nueva queda guardada.
 */
async function assertWithinFreeTier(
  db: Database,
  accepted: AcceptedMediaUpload,
  replacedBytes: number,
  now: Date,
): Promise<void> {
  const [[storage], [month]] = await Promise.all([
    db.select({ total: sql<number>`coalesce(sum(${exerciseMedia.bytes}), 0)` }).from(exerciseMedia),
    db
      .select({ uploads: mediaUploadMonth.uploads })
      .from(mediaUploadMonth)
      .where(eq(mediaUploadMonth.month, uploadMonth(now))),
  ]);

  const stored = (storage?.total ?? 0) - replacedBytes;
  if (stored + accepted.bytes > MEDIA_STORAGE_BUDGET_BYTES) {
    throw new ApiException('media_quota_exceeded', 'No queda espacio para más fotos ni vídeos', {
      reason: 'storage',
    });
  }
  if ((month?.uploads ?? 0) >= MEDIA_MONTHLY_UPLOAD_LIMIT) {
    throw new ApiException(
      'media_quota_exceeded',
      'Se han subido demasiadas fotos y vídeos este mes',
      {
        reason: 'monthly_uploads',
      },
    );
  }
}

/** Borra un fichero de R2 sin tumbar la petición: uno que se queda huérfano solo ocupa sitio. */
async function deleteObjectQuietly(bucket: R2Bucket, key: string): Promise<void> {
  try {
    await bucket.delete(key);
  } catch (error) {
    console.error(`No se pudo borrar ${key} de R2: se queda huérfano`, error);
  }
}

export interface PutExerciseMediaInput {
  readonly headers: MediaUploadHeaders;
  readonly body: ReadableStream<Uint8Array> | null;
}

/**
 * Pone o sustituye la foto o el vídeo de un ejercicio propio. El fichero pasa a R2 en streaming, sin cargarlo
 * en memoria ni gastar CPU en él, y solo cuando está guardado se apunta en D1: una fila nunca
 * señala un fichero que no existe. Si D1 falla después, el fichero nuevo se retira.
 */
export async function putExerciseMedia(
  db: Database,
  bucket: R2Bucket,
  userId: string,
  exerciseId: string,
  input: PutExerciseMediaInput,
  locale: Locale,
  now: Date,
): Promise<TrackedExercise> {
  const target = await findMediaTarget(db, userId, exerciseId);
  if (target.catalogId !== null) {
    throw new ApiException(
      'media_not_allowed',
      'Solo los ejercicios propios llevan foto o vídeo: los del catálogo ya tienen su animación',
    );
  }

  const accepted = acceptMediaUpload(input.headers);
  await assertWithinFreeTier(db, accepted, target.mediaBytes ?? 0, now);
  if (input.body === null) {
    throw new ApiException('validation_failed', 'La petición no trae el fichero');
  }

  const mediaId = crypto.randomUUID();
  const key = mediaObjectKey(userId, mediaId);
  await storeExactly(bucket, key, input.body, accepted);

  const uploadedAt = now.toISOString();
  try {
    await db.batch([
      db
        .insert(exerciseMedia)
        .values({
          trackedExerciseId: exerciseId,
          userId,
          mediaId,
          kind: accepted.kind,
          contentType: accepted.contentType,
          bytes: accepted.bytes,
          uploadedAt,
        })
        .onConflictDoUpdate({
          target: exerciseMedia.trackedExerciseId,
          set: {
            mediaId,
            kind: accepted.kind,
            contentType: accepted.contentType,
            bytes: accepted.bytes,
            uploadedAt,
          },
        }),
      db
        .insert(mediaUploadMonth)
        .values({ month: uploadMonth(now), uploads: 1 })
        .onConflictDoUpdate({
          target: mediaUploadMonth.month,
          set: { uploads: sql`${mediaUploadMonth.uploads} + 1` },
        }),
    ]);
  } catch (error) {
    await deleteObjectQuietly(bucket, key);
    throw error;
  }

  if (target.mediaId !== null) {
    await deleteObjectQuietly(bucket, mediaObjectKey(userId, target.mediaId));
  }

  return requireExercise(db, userId, exerciseId, locale);
}

/**
 * Guarda el cuerpo con la longitud declarada. `FixedLengthStream` es lo que deja a R2 aceptar un
 * cuerpo en streaming, y además hace fallar la escritura si llegan más o menos bytes de los dichos:
 * así el tope por fichero no se puede saltar mintiendo en `Content-Length`.
 */
async function storeExactly(
  bucket: R2Bucket,
  key: string,
  body: ReadableStream<Uint8Array>,
  accepted: AcceptedMediaUpload,
): Promise<void> {
  const { readable, writable } = new FixedLengthStream(accepted.bytes);
  // Los bytes se cuentan al pasar: cuando el cuerpo es corto, la copia termina bien y quien falla es
  // R2, y sin la cuenta ese fallo no se distinguiría de una caída de R2.
  let received = 0;
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength;
      controller.enqueue(chunk);
    },
  });
  const [piped, stored] = await Promise.allSettled([
    body.pipeThrough(counter).pipeTo(writable),
    bucket.put(key, readable, { httpMetadata: { contentType: accepted.contentType } }),
  ]);

  if (piped.status === 'rejected' || received !== accepted.bytes) {
    // R2 puede haber rechazado la escritura o no; se retira por si acaso.
    await deleteObjectQuietly(bucket, key);
    console.error(
      `El fichero no llegó con el tamaño declarado (${String(received)} de ${String(accepted.bytes)})`,
      piped.status === 'rejected' ? piped.reason : undefined,
    );
    throw new ApiException('validation_failed', 'El fichero no llegó entero', {
      bytes: accepted.bytes,
    });
  }
  if (stored.status === 'rejected') throw stored.reason;
}

/** Quita la foto o el vídeo. Idempotente: sin medio, devuelve el ejercicio tal cual. */
export async function removeExerciseMedia(
  db: Database,
  bucket: R2Bucket,
  userId: string,
  exerciseId: string,
  locale: Locale,
): Promise<TrackedExercise> {
  const [removed] = await db
    .delete(exerciseMedia)
    .where(and(eq(exerciseMedia.trackedExerciseId, exerciseId), eq(exerciseMedia.userId, userId)))
    .returning({ mediaId: exerciseMedia.mediaId });

  // La fila va primero: si R2 falla después, la ficha ya no enseña un medio a medio borrar.
  if (removed !== undefined) {
    await deleteObjectQuietly(bucket, mediaObjectKey(userId, removed.mediaId));
  }

  return requireExercise(db, userId, exerciseId, locale);
}

/**
 * El fichero del medio vigente de un ejercicio de esta cuenta. Uno ya sustituido responde 404 aunque
 * su fichero siguiera en R2: solo se sirve lo que la ficha enseña.
 */
export async function readExerciseMedia(
  db: Database,
  bucket: R2Bucket,
  userId: string,
  exerciseId: string,
  mediaId: string,
): Promise<R2ObjectBody> {
  const notFound = new ApiException('not_found', 'Ese fichero no existe', { exerciseId, mediaId });

  const [row] = await db
    .select({ mediaId: exerciseMedia.mediaId })
    .from(exerciseMedia)
    .where(
      and(
        eq(exerciseMedia.trackedExerciseId, exerciseId),
        eq(exerciseMedia.userId, userId),
        eq(exerciseMedia.mediaId, mediaId),
      ),
    )
    .limit(1);
  if (row === undefined) throw notFound;

  const object = await bucket.get(mediaObjectKey(userId, mediaId));
  if (object === null) {
    console.error(`El medio ${mediaId} está en D1 pero no en R2`);
    throw notFound;
  }

  return object;
}

async function requireExercise(
  db: Database,
  userId: string,
  exerciseId: string,
  locale: Locale,
): Promise<TrackedExercise> {
  const exercise = await findTrackedExercise(db, userId, exerciseId, locale);
  if (exercise === null) throw exerciseNotFound(exerciseId);

  return exercise;
}
