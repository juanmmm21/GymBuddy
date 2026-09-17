import type { MediaFileStore, MediaFileUsage } from './media-file-store';

/**
 * Lo que pueden ocupar en el dispositivo las fotos y los vídeos ya vistos. Un vídeo convertido de un
 * minuto ronda los 11 MB (40 MB como mucho) y una foto medio mega: doscientos megas son una
 * quincena de vídeos, de sobra para los ejercicios propios de una persona, y junto a los 45–90 MB
 * de los GIFs del catálogo quedan lejos de lo que Safari deja a una PWA instalada.
 */
export const MEDIA_FILE_BUDGET_BYTES = 200 * 1024 * 1024;

/**
 * Qué ficheros hay que retirar para que quepa uno nuevo sin pasar de `budgetBytes`: los que más
 * tiempo llevan sin mirarse, primero. `null` si el nuevo no cabe ni con todo lo demás fuera; en ese
 * caso no se guarda y no se retira nada. Si el nuevo ya estaba guardado, no cuenta dos veces.
 */
export function mediaFilesToEvict(
  stored: readonly MediaFileUsage[],
  incoming: { readonly mediaId: string; readonly bytes: number },
  budgetBytes: number,
): readonly string[] | null {
  if (incoming.bytes > budgetBytes) return null;

  const others = stored
    .filter((usage) => usage.mediaId !== incoming.mediaId)
    .sort(
      (left, right) =>
        left.lastUsedAt - right.lastUsedAt || left.mediaId.localeCompare(right.mediaId),
    );
  let total = others.reduce((sum, usage) => sum + usage.bytes, 0) + incoming.bytes;
  const evicted: string[] = [];

  for (const usage of others) {
    if (total <= budgetBytes) break;
    evicted.push(usage.mediaId);
    total -= usage.bytes;
  }

  return evicted;
}

export interface MediaFileCache {
  readonly store: MediaFileStore;
  readonly now: () => Date;
  readonly budgetBytes: number;
}

/**
 * El fichero de un medio: el guardado en el dispositivo si está y, si no, el descargado, que se
 * guarda para la próxima vez. El almacén nunca tumba la lectura: si falla, se descarga igual, y si
 * no se puede guardar (cuota, modo privado) se enseña igual y sin red no estará.
 */
export async function loadMediaFile(
  cache: MediaFileCache,
  mediaId: string,
  download: () => Promise<Blob>,
): Promise<Blob> {
  const saved = await readSavedMediaFile(cache, mediaId);
  if (saved !== null) return saved;

  const file = await download();
  await saveMediaFile(cache, mediaId, file);
  return file;
}

/**
 * Guarda un fichero que ya se tiene, haciéndole sitio. Lo usa también la subida: lo que se acaba de
 * subir es exactamente lo que el Worker guardó, y así no se vuelve a bajar un vídeo de 11 MB.
 */
export async function saveMediaFile(
  cache: MediaFileCache,
  mediaId: string,
  file: Blob,
): Promise<void> {
  try {
    const evicted = mediaFilesToEvict(
      await cache.store.usage(),
      { mediaId, bytes: file.size },
      cache.budgetBytes,
    );
    if (evicted === null) {
      console.error('Un medio no se guarda para verlo sin red: no cabe en el espacio reservado');
      return;
    }
    await cache.store.remove(evicted);
    await cache.store.write(mediaId, file, cache.now().getTime());
  } catch (error) {
    console.error('No se pudo guardar un medio para verlo sin red', error);
  }
}

/** Retira lo guardado de un medio que ya no existe (quitado o sustituido). */
export async function forgetMediaFile(cache: MediaFileCache, mediaId: string): Promise<void> {
  try {
    await cache.store.remove([mediaId]);
  } catch (error) {
    console.error('No se pudo retirar del dispositivo un medio que ya no existe', error);
  }
}

/** Vacía lo guardado, al cerrar sesión: lo de una cuenta no se queda para la siguiente. */
export async function clearMediaFiles(cache: MediaFileCache): Promise<void> {
  try {
    await cache.store.clear();
  } catch (error) {
    console.error('No se pudieron borrar del dispositivo los medios de la cuenta', error);
  }
}

async function readSavedMediaFile(cache: MediaFileCache, mediaId: string): Promise<Blob | null> {
  let saved: Blob | null;
  try {
    saved = await cache.store.read(mediaId);
  } catch (error) {
    console.error('No se pudo leer un medio guardado en el dispositivo; se descarga', error);
    return null;
  }
  if (saved === null) return null;

  try {
    await cache.store.markUsed(mediaId, cache.now().getTime());
  } catch (error) {
    // Solo afecta a qué se retira primero cuando falte sitio: el fichero se enseña igual.
    console.error('No se pudo apuntar el uso de un medio guardado', error);
  }
  return saved;
}
