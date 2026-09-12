/**
 * Copia un texto al portapapeles y dice si se pudo. El portapapeles no está siempre: falta en
 * contextos sin HTTPS y el navegador puede negar el permiso, así que quien llama tiene que poder
 * ofrecer el código para copiarlo a mano en vez de dar por hecho que se copió.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  const { clipboard } = navigator;
  if (clipboard === undefined) return false;

  try {
    await clipboard.writeText(text);
    return true;
  } catch (error) {
    console.warn('No se pudo copiar al portapapeles', error);
    return false;
  }
}
