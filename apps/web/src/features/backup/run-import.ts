import {
  deriveImportedIds,
  findCatalogConflicts,
  type ExportFile,
  type ImportPlan,
} from '@gymbuddy/shared';
import type { ApiClient } from '../../api/client';
import {
  importExercises,
  importRoutines,
  importSessions,
  listTrackedExercises,
} from '../../api/endpoints';

export type ImportPhase = 'exercises' | 'routines' | 'sessions';

export interface ImportProgress {
  readonly phase: ImportPhase;
  /** Entradas de esta fase ya subidas. */
  readonly done: number;
  readonly total: number;
}

export interface ImportResult {
  readonly exercises: number;
  readonly sessions: number;
  readonly routines: number;
  /** Ejercicios del catálogo que entraron como propios porque aquí el catálogo no los tiene. */
  readonly enteredAsCustom: number;
}

/**
 * La cuenta ya sigue con otra ficha algún ejercicio del catálogo de la copia. Se descubre antes
 * de subir nada, así que la cuenta queda como estaba.
 */
export class ImportConflictError extends Error {
  readonly exerciseNames: readonly string[];

  constructor(exerciseNames: readonly string[]) {
    super('La cuenta ya sigue ejercicios de la copia');
    this.name = 'ImportConflictError';
    this.exerciseNames = exerciseNames;
  }
}

/**
 * Sube una copia ya validada a la cuenta con sesión, por los lotes de `plan`: ejercicios, rutinas
 * y sesiones, en ese orden y de uno en uno. Cada lote es idempotente en el Worker, así que si se
 * corta a mitad, volver a lanzarla termina lo que faltaba sin duplicar lo que ya entró.
 *
 * Antes de escribir mira si la cuenta ya sigue alguno de sus ejercicios del catálogo con otra
 * ficha: el Worker también lo rechaza, pero lote a lote, y los anteriores ya habrían entrado.
 */
export async function runImport(
  client: ApiClient,
  userId: string,
  file: ExportFile,
  plan: ImportPlan,
  onProgress: (progress: ImportProgress) => void,
): Promise<ImportResult> {
  const account = await listTrackedExercises(client, { includeArchived: true });
  const importedIds = await deriveImportedIds(
    userId,
    file.exercises.map((exercise) => exercise.id),
  );
  const conflicts = new Set(findCatalogConflicts(file.exercises, account, importedIds));
  if (conflicts.size > 0) {
    throw new ImportConflictError(
      file.exercises
        .filter((exercise) => exercise.catalogId !== null && conflicts.has(exercise.catalogId))
        .map((exercise) => exercise.name),
    );
  }

  let enteredAsCustom = 0;
  await uploadPhase('exercises', plan.exercises, onProgress, async (exercises) => {
    const response = await importExercises(client, { exercises: [...exercises] });
    enteredAsCustom += response.enteredAsCustom.length;
  });
  await uploadPhase('routines', plan.routines, onProgress, async (routines) => {
    await importRoutines(client, { routines: [...routines] });
  });
  await uploadPhase('sessions', plan.sessions, onProgress, async (sessions) => {
    await importSessions(client, { sessions: [...sessions] });
  });

  return {
    exercises: file.exercises.length,
    sessions: file.sessions.length,
    routines: file.routines.length,
    enteredAsCustom,
  };
}

async function uploadPhase<T>(
  phase: ImportPhase,
  batches: readonly (readonly T[])[],
  onProgress: (progress: ImportProgress) => void,
  upload: (batch: readonly T[]) => Promise<void>,
): Promise<void> {
  const total = batches.reduce((count, batch) => count + batch.length, 0);
  let done = 0;

  for (const batch of batches) {
    await upload(batch);
    done += batch.length;
    onProgress({ phase, done, total });
  }
}
