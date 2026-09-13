import {
  ApiContractError,
  ApiRequestError,
  ApiTransportError,
  type ApiClient,
} from '../api/client';
import { endSession, logSet, removeSet, startSession, updateSet } from '../api/endpoints';
import type { SessionWrite } from './pending-write';

/**
 * Manda una escritura al Worker. Las cinco son repetibles sin duplicar nada —las altas por el
 * id del cliente, corregir porque manda los mismos valores, borrar y cerrar porque el Worker
 * responde igual la segunda vez—, y es lo que permite reenviarlas desde la cola sin miedo.
 */
export function sendSessionWrite(client: ApiClient, write: SessionWrite): Promise<unknown> {
  switch (write.kind) {
    case 'start_session':
      return startSession(client, write.body);
    case 'log_set':
      return logSet(client, write.sessionId, write.body);
    case 'update_set':
      return updateSet(client, write.sessionId, write.setId, write.body);
    case 'remove_set':
      return removeSet(client, write.sessionId, write.setId);
    case 'end_session':
      return endSession(client, write.sessionId, write.body);
  }
}

/**
 * Qué hacer con una escritura que no salió bien:
 * - `retry_later`: el fallo no dice nada de la escritura (sin red, el servidor caído, la sesión
 *   caducada); se guarda y se reintenta tal cual.
 * - `discard`: el Worker la leyó y la rechazó (`session_closed`, `conflicting_write`…). Repetirla
 *   daría lo mismo para siempre, así que se enseña y se retira.
 * - `already_applied`: respondió 2xx pero fuera de contrato. La escritura entró; reenviarla no
 *   arregla la respuesta y solo gastaría escrituras de D1.
 */
export type WriteFailureHandling = 'retry_later' | 'discard' | 'already_applied';

/** Estados sin contrato que también se arreglan esperando: petición caducada y demasiadas peticiones. */
const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([408, 429]);

export function handleWriteFailure(error: unknown): WriteFailureHandling {
  if (error instanceof ApiTransportError) return 'retry_later';

  if (error instanceof ApiContractError) {
    if (error.status >= 200 && error.status < 300) return 'already_applied';
    return error.status >= 500 || RETRYABLE_STATUSES.has(error.status) ? 'retry_later' : 'discard';
  }

  if (error instanceof ApiRequestError) {
    // Con la sesión caducada la escritura sigue siendo buena: se envía cuando se vuelva a entrar.
    if (error.code === 'unauthorized') return 'retry_later';
    return error.status >= 500 ? 'retry_later' : 'discard';
  }

  // Un fallo que no viene del cliente de la API es un error de programación. Reintentarlo cada
  // pocos segundos no lo arregla: se retira y se enseña, igual que un rechazo del Worker.
  return 'discard';
}
