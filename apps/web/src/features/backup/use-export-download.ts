import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { useState } from 'react';
import { useApiClient } from '../../api/provider';
import { saveTextFile } from '../../lib/save-file';
import {
  collectExportFile,
  exportFileName,
  serializeExportFile,
  type ExportProgress,
} from './collect-export';

const EXPORT_MIME_TYPE = 'application/json';

/** El navegador no deja entregar ficheros desde la app, así que no hay copia que dar por hecha. */
export class ExportSaveError extends Error {
  constructor() {
    super('El navegador no dejó guardar el fichero');
    this.name = 'ExportSaveError';
  }
}

export interface ExportSummary {
  readonly fileName: string;
  readonly sessions: number;
  readonly exercises: number;
  readonly routines: number;
}

export interface ExportDownload {
  readonly download: UseMutationResult<ExportSummary, Error, void>;
  /** Por dónde va mientras se descargan las páginas de sesiones; `null` antes de la primera. */
  readonly progress: ExportProgress | null;
  readonly start: () => void;
}

/**
 * Prepara la copia y la entrega como descarga. Es una mutación y no una consulta aunque solo lea:
 * se lanza al pulsar, no al abrir la pantalla, y no tiene sentido cachearla ni repetirla sola.
 */
export function useExportDownload(): ExportDownload {
  const client = useApiClient();
  const [progress, setProgress] = useState<ExportProgress | null>(null);

  const download = useMutation({
    mutationFn: async (): Promise<ExportSummary> => {
      const file = await collectExportFile(client, setProgress);
      const fileName = exportFileName(file);

      if (!saveTextFile(fileName, serializeExportFile(file), EXPORT_MIME_TYPE)) {
        throw new ExportSaveError();
      }

      return {
        fileName,
        sessions: file.sessions.length,
        exercises: file.exercises.length,
        routines: file.routines.length,
      };
    },
  });

  const start = (): void => {
    setProgress(null);
    download.mutate();
  };

  return { download, progress, start };
}
