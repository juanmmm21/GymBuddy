import { ApiRequestError } from '../api/client';
import { describeError } from '../lib/errors';
import type { SessionWrite, SessionWriteKind } from './pending-write';
import { t, plural } from '../i18n/index';

/** El titular del aviso: cuántas cosas esperan, dicho como lo diría quien entrena. */
export function describePendingWrites(count: number): string {
  return plural(
    count,
    ['cambio sin sincronizar', 'cambios sin sincronizar'],
    ['unsynced change', 'unsynced changes'],
  );
}

function droppedTitle(kind: SessionWriteKind): string {
  switch (kind) {
    case 'start_session':
      return t('No se pudo abrir la sesión', 'The session couldn’t be opened');
    case 'log_set':
      return t('No se guardó una serie', 'A set wasn’t saved');
    case 'update_set':
      return t('No se guardó una corrección', 'An edit wasn’t saved');
    case 'remove_set':
      return t('No se borró una serie', 'A set wasn’t deleted');
    case 'start_cardio':
      return t('No se pudo empezar el cardio', 'Cardio couldn’t be started');
    case 'cancel_cardio':
      return t('No se quitó el cardio en marcha', 'The running cardio wasn’t removed');
    case 'end_session':
      return t('No se pudo cerrar la sesión', 'The session couldn’t be closed');
  }
}

export function droppedWriteTitle(write: SessionWrite): string {
  return droppedTitle(write.kind);
}

/**
 * Por qué no entró. Los choques que solo aparecen al drenar tarde —la sesión se cerró sola o desde
 * otro móvil, se abrió otra mientras este no tenía red, o se borró— llevan su propio texto: el mensaje genérico
 * del Worker no explica que el dato se escribió bien y lo que cambió fue la sesión.
 */
export function droppedWriteReason(error: unknown): string {
  if (error instanceof ApiRequestError) {
    switch (error.code) {
      case 'session_closed':
        return t(
          'La sesión ya estaba cerrada: se cierra sola tras una hora sin series, o la cerraste desde otro móvil. Esta serie empieza una sesión nueva si la vuelves a registrar.',
          'The session was already closed: it closes on its own after an hour without sets, or you closed it from another phone. This set starts a new session if you log it again.',
        );
      case 'session_already_open':
        return t(
          'Ya había otra sesión abierta, seguramente desde otro móvil, y lo registrado aquí sin conexión no entró en ella.',
          'Another session was already open, probably from another phone, and what you logged here offline didn’t go into it.',
        );
      case 'conflicting_write':
        return t(
          'Ya había guardado algo con el mismo identificador y otros datos.',
          'Something was already saved with the same identifier and different data.',
        );
      case 'not_found':
        return t(
          'Ya no existe: el entrenamiento o la serie se borró desde otro móvil antes de que esto llegara.',
          'It no longer exists: the workout or set was deleted from another phone before this arrived.',
        );
      default:
        break;
    }
  }
  return describeError(error);
}
