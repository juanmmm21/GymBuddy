/**
 * La dirección de la miniatura de un ejercicio en las listas del catálogo. Es el mismo GIF con un
 * parámetro que jsDelivr ignora (comprobado contra el CDN el 2026-09-14: mismo fichero, 200 y CORS
 * abierto), y ese parámetro es lo que la deja **fuera de la caché offline**: el patrón de
 * `offline/service-worker.ts` exige que la URL acabe en `.gif`. Así ojear el catálogo no echa de la
 * caché, que tiene tope, los GIFs de los ejercicios que se entrenan sin cobertura.
 */
export function previewGifUrl(gifUrl: string): string {
  return `${gifUrl}?preview`;
}
