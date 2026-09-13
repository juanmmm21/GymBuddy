/**
 * Safari, sobre todo en iOS, empieza a leer el blob un instante después del clic: revocar la
 * URL en el mismo tick deja la descarga vacía. Un minuto sobra para que la tome y no deja
 * el fichero en memoria mientras la pantalla siga abierta.
 */
const REVOKE_DELAY_MS = 60_000;

/**
 * Entrega un fichero de texto al usuario como descarga y dice si se pudo. No hay API para saber
 * si de verdad lo guardó, pero sí para saber cuándo el navegador ni siquiera lo permite, y en
 * ese caso quien llama tiene que decirlo en vez de dar la copia por hecha.
 */
export function saveTextFile(fileName: string, contents: string, mimeType: string): boolean {
  if (typeof URL.createObjectURL !== 'function') return false;

  let url: string;
  try {
    url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
  } catch (error) {
    console.warn('No se pudo preparar el fichero para descargarlo', error);
    return false;
  }

  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.hidden = true;
  document.body.append(link);

  try {
    link.click();
    return true;
  } catch (error) {
    console.warn('El navegador no dejó descargar el fichero', error);
    return false;
  } finally {
    link.remove();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, REVOKE_DELAY_MS);
  }
}
