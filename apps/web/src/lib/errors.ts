import type { ApiErrorCode } from '@gymbuddy/shared';
import { ApiContractError, ApiRequestError, ApiTransportError } from '../api/client';
import { currentLocale, t } from '../i18n/index';

/** Frase para el usuario. El código del contrato decide; el texto del Worker es el respaldo. */
export function describeError(error: unknown): string {
  if (error instanceof ApiTransportError) {
    return t(
      'Sin conexión. Lo que ya está cargado sigue disponible; se reintentará al volver la red.',
      'No connection. What’s already loaded is still available; it will retry when you’re back online.',
    );
  }
  if (error instanceof ApiContractError) {
    return t(
      'La app y el servidor no hablan la misma versión. Vuelve a cargar la app.',
      'The app and the server are on different versions. Reload the app.',
    );
  }
  if (error instanceof ApiRequestError) {
    switch (error.code) {
      case 'unauthorized':
        return t(
          'La sesión ha caducado. Entra de nuevo.',
          'Your session has expired. Sign in again.',
        );
      case 'catalog_unavailable':
        return t(
          'El catálogo de ejercicios no está disponible ahora mismo.',
          'The exercise catalogue isn’t available right now.',
        );
      case 'invitation_limit_reached':
        return t(
          'Ya has creado todas las invitaciones que tocan por ahora.',
          'You’ve already created all the invitations you can for now.',
        );
      case 'media_too_large':
        return t(
          'El fichero pesa demasiado. Prueba con otro.',
          'The file is too large. Try another one.',
        );
      case 'media_quota_exceeded':
        return t(
          'Se ha llegado al tope gratuito de fotos y vídeos (espacio o subidas del mes). No se ha guardado.',
          'The free limit for photos and videos has been reached (storage or this month’s uploads). It wasn’t saved.',
        );
      default:
        // El Worker escribe sus mensajes en español; en inglés se dice lo que el código cuenta.
        return currentLocale() === 'es' ? error.message : englishMessage(error.code);
    }
  }
  return t('Algo ha fallado. Inténtalo de nuevo.', 'Something went wrong. Try again.');
}

function englishMessage(code: ApiErrorCode): string {
  switch (code) {
    case 'validation_failed':
      return 'Some of the data isn’t valid. Check it and try again.';
    case 'not_found':
      return 'It no longer exists. It may have been deleted from another device.';
    case 'invitation_invalid':
      return 'That invitation code doesn’t work.';
    case 'device_link_invalid':
      return 'That device code doesn’t work. Get a new one.';
    case 'passkey_invalid':
      return 'Your passkey couldn’t be verified.';
    case 'exercise_already_tracked':
      return 'That exercise is already in your exercises.';
    case 'session_already_open':
      return 'There’s already a session in progress.';
    case 'session_closed':
      return 'That session is already finished.';
    case 'conflicting_write':
      return 'That change clashes with one already saved.';
    case 'import_conflict':
      return 'The backup clashes with exercises you already have.';
    case 'media_not_allowed':
      return 'Only your own exercises can have a photo or video.';
    default:
      return 'Something went wrong. Try again.';
  }
}
