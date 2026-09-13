import type { ExportFile, ImportPlan } from '@gymbuddy/shared';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { useState } from 'react';
import { useApiClient } from '../../api/provider';
import { useSession } from '../../auth/SessionProvider';
import { runImport, type ImportProgress, type ImportResult } from './run-import';

export interface ImportRequest {
  readonly file: ExportFile;
  readonly plan: ImportPlan;
}

export interface ImportBackup {
  readonly restore: UseMutationResult<ImportResult, Error, ImportRequest>;
  /** Por dónde va la subida; `null` antes del primer lote. */
  readonly progress: ImportProgress | null;
  readonly start: (request: ImportRequest) => void;
}

/**
 * Recupera una copia en la cuenta con sesión. Al terminar se invalida toda la caché, también si
 * falla a mitad (los lotes anteriores ya entraron): lo que entra toca ejercicios, historial,
 * estadísticas, rutinas y Hoy a la vez, y enumerar claves dejaría alguna pantalla con lo de antes.
 */
export function useImportBackup(): ImportBackup {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const [progress, setProgress] = useState<ImportProgress | null>(null);

  const restore = useMutation({
    mutationFn: async ({ file, plan }: ImportRequest): Promise<ImportResult> => {
      // La pantalla cuelga de `RequireSession`: sin sesión aquí no se llega.
      if (session === null) throw new Error('Hace falta una sesión para recuperar una copia');

      return runImport(client, session.user.id, file, plan, setProgress);
    },
    onSettled: () => queryClient.invalidateQueries(),
  });

  const start = (request: ImportRequest): void => {
    setProgress(null);
    restore.mutate(request);
  };

  return { restore, progress, start };
}
