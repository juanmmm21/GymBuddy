import { ApiRequestError } from '../api/client';
import { describeError } from '../lib/errors';
import { pluralize } from '../lib/format';
import type { SessionWrite, SessionWriteKind } from './pending-write';

/** El titular del aviso: cuántas cosas esperan, dicho como lo diría quien entrena. */
export function describePendingWrites(count: number): string {
  return pluralize(count, 'cambio sin sincronizar', 'cambios sin sincronizar');
}

const DROPPED_TITLES: Readonly<Record<SessionWriteKind, string>> = {
  start_session: 'No se pudo abrir la sesión',
  log_set: 'No se guardó una serie',
  update_set: 'No se guardó una corrección',
  remove_set: 'No se borró una serie',
  end_session: 'No se pudo cerrar la sesión',
};

export function droppedWriteTitle(write: SessionWrite): string {
  return DROPPED_TITLES[write.kind];
}

/**
 * Por qué no entró. Los dos choques que solo aparecen al drenar tarde —otro móvil cerró la
 * sesión o abrió otra mientras este no tenía red— llevan su propio texto: el mensaje genérico
 * del Worker no explica que el dato se escribió bien y lo que cambió fue la sesión.
 */
export function droppedWriteReason(error: unknown): string {
  if (error instanceof ApiRequestError) {
    switch (error.code) {
      case 'session_closed':
        return 'La sesión ya estaba cerrada, seguramente desde otro móvil, y sus series ya no se pueden tocar.';
      case 'session_already_open':
        return 'Ya había otra sesión abierta, seguramente desde otro móvil, y lo registrado aquí sin conexión no entró en ella.';
      case 'conflicting_write':
        return 'Ya había guardado algo con el mismo identificador y otros datos.';
      default:
        break;
    }
  }
  return describeError(error);
}
