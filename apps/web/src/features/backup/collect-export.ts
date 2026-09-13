import {
  buildExportFile,
  exportFileSchema,
  type ExportFile,
  type ExportedSession,
} from '@gymbuddy/shared';
import type { ApiClient } from '../../api/client';
import { fetchExportSessionPage, fetchExportSnapshot } from '../../api/endpoints';
import { nextPageOffset } from '../../lib/paging';

export interface ExportProgress {
  readonly loadedSessions: number;
  readonly totalSessions: number;
}

/**
 * Las piezas descargadas no forman un fichero válido. Pasa si los datos cambian mientras se
 * junta la copia de una forma que las lecturas por orden no cubren; volver a pedirla lo arregla.
 */
export class ExportIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportIntegrityError';
  }
}

/**
 * Descarga todo lo del usuario y lo junta en el fichero de copia. Las sesiones van por páginas
 * —un historial de años no cabe en una respuesta del Worker— y lo demás al final, porque los
 * ejercicios leídos después ya incluyen cualquiera que nombre una serie descargada antes.
 *
 * El fichero se valida con el esquema del contrato antes de entregarlo: una copia de seguridad
 * que no se pueda importar es peor que no tenerla, porque da una tranquilidad falsa.
 */
export async function collectExportFile(
  client: ApiClient,
  onProgress: (progress: ExportProgress) => void,
): Promise<ExportFile> {
  const sessions: ExportedSession[] = [];
  let offset: number | undefined = 0;

  while (offset !== undefined) {
    const page = await fetchExportSessionPage(client, offset);
    sessions.push(...page.items);
    onProgress({ loadedSessions: sessions.length, totalSessions: page.total });
    offset = nextPageOffset(page);
  }

  const snapshot = await fetchExportSnapshot(client);
  const result = exportFileSchema.safeParse(buildExportFile(snapshot, sessions));
  if (!result.success) {
    console.error('La copia de seguridad no cumple el contrato', result.error.issues);
    throw new ExportIntegrityError('La copia de seguridad salió incompleta');
  }

  return result.data;
}

/** `gymbuddy-2026-09-13.json`: la fecha basta para ordenar varias copias en una carpeta. */
export function exportFileName(file: ExportFile): string {
  return `gymbuddy-${file.exportedAt.slice(0, 10)}.json`;
}

/** Con sangría: es la copia de alguien, y tiene que poder abrirla y leerla si le hace falta. */
export function serializeExportFile(file: ExportFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}
