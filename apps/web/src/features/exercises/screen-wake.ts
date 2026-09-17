/** Lo que hace falta de `navigator.wakeLock`: el tipo del DOM no existe en todos los navegadores. */
export interface WakeLockProvider {
  request(type: 'screen'): Promise<{ release(): Promise<void> }>;
}

/** Suelta la pantalla. Llamarlo dos veces no hace nada. */
export type ReleaseScreen = () => void;

/**
 * Mantiene la pantalla encendida mientras el móvil convierte y sube un vídeo: el iPhone se bloquea a
 * los 30 s por defecto y, bloqueado, iOS suspende la conversión. Es una ayuda y no una condición: sin
 * `wakeLock` (o si el navegador lo niega) se sigue igual y la pantalla ya avisa de no salir.
 */
export async function holdScreenAwake(
  provider: WakeLockProvider | undefined = browserWakeLock(),
): Promise<ReleaseScreen> {
  if (provider === undefined) return () => undefined;

  let sentinel: { release(): Promise<void> };
  try {
    sentinel = await provider.request('screen');
  } catch (error) {
    console.warn('El navegador no dejó mantener la pantalla encendida', error);
    return () => undefined;
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    sentinel.release().catch((error: unknown) => {
      console.warn('No se pudo soltar la pantalla; se suelta sola al salir de la app', error);
    });
  };
}

function browserWakeLock(): WakeLockProvider | undefined {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return undefined;

  return navigator.wakeLock;
}
