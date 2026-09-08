import { ApiContractError, ApiRequestError, ApiTransportError } from '../api/client';

/** Frase para el usuario. El código del contrato decide; el texto del Worker es el respaldo. */
export function describeError(error: unknown): string {
  if (error instanceof ApiTransportError) {
    return 'Sin conexión. Lo que ya está cargado sigue disponible; se reintentará al volver la red.';
  }
  if (error instanceof ApiContractError) {
    return 'La app y el servidor no hablan la misma versión. Vuelve a cargar la app.';
  }
  if (error instanceof ApiRequestError) {
    switch (error.code) {
      case 'unauthorized':
        return 'La sesión ha caducado. Entra de nuevo.';
      case 'catalog_unavailable':
        return 'El catálogo de ejercicios no está disponible ahora mismo.';
      default:
        return error.message;
    }
  }
  return 'Algo ha fallado. Inténtalo de nuevo.';
}
