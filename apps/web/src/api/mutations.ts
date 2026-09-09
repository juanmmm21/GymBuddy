import type {
  CreateTrackedExerciseRequest,
  EndSessionRequest,
  LogSetRequest,
  LogSetResponse,
  ResourceId,
  StartSessionRequest,
  TrackedExercise,
  UpdateTrackedExerciseRequest,
  WorkoutSession,
} from '@gymbuddy/shared';
import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { ApiRequestError, type ApiClient } from './client';
import {
  createTrackedExercise,
  endSession,
  listTrackedExercises,
  logSet,
  startSession,
  updateTrackedExercise,
} from './endpoints';
import { useApiClient } from './provider';
import { queryKeys } from './queries';

export interface UpdateTrackedExerciseVariables {
  readonly exerciseId: ResourceId;
  readonly body: UpdateTrackedExerciseRequest;
}

/**
 * Edita las notas o archiva / recupera un ejercicio seguido. Cambia lo que el listado
 * muestra de él, así que se invalida el listado entero: las fichas lo leen de ahí.
 */
export function useUpdateTrackedExercise(): UseMutationResult<
  TrackedExercise,
  Error,
  UpdateTrackedExerciseVariables
> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ exerciseId, body }: UpdateTrackedExerciseVariables) =>
      updateTrackedExercise(client, exerciseId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.exercises.all }),
  });
}

/**
 * Da de alta un ejercicio en "mis ejercicios". El identificador lo trae la petición, así
 * que reenviarla es idempotente. Al terminar se invalida el listado, que es lo que cambia.
 */
export function useCreateTrackedExercise(): UseMutationResult<
  TrackedExercise,
  Error,
  CreateTrackedExerciseRequest
> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateTrackedExerciseRequest) => trackExercise(client, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.exercises.all }),
  });
}

/**
 * Una escritura de entrenamiento toca las tres familias de datos: la sesión, el peso
 * habitual que sale en "mis ejercicios" y las señales y marcas de las estadísticas. Se
 * invalidan juntas porque una serie las mueve todas a la vez.
 */
async function invalidateTrainingData(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.exercises.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.stats.all }),
  ]);
}

/**
 * Abre una sesión. El identificador lo trae la petición, así que reenviarla devuelve la
 * que ya está abierta en vez de encadenar sesiones vacías.
 */
export function useStartSession(): UseMutationResult<WorkoutSession, Error, StartSessionRequest> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: StartSessionRequest) => startSession(client, body),
    onSuccess: () => invalidateTrainingData(queryClient),
  });
}

export interface LogSetVariables {
  readonly sessionId: ResourceId;
  readonly body: LogSetRequest;
}

/**
 * Registra una serie. La respuesta trae las marcas que acaba de romper para celebrarlas
 * en el momento; en un reenvío llegan vacías porque la marca ya estaba puesta.
 */
export function useLogSet(): UseMutationResult<LogSetResponse, Error, LogSetVariables> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sessionId, body }: LogSetVariables) => logSet(client, sessionId, body),
    onSuccess: () => invalidateTrainingData(queryClient),
  });
}

export interface EndSessionVariables {
  readonly sessionId: ResourceId;
  readonly body?: EndSessionRequest;
}

export function useEndSession(): UseMutationResult<WorkoutSession, Error, EndSessionVariables> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sessionId, body }: EndSessionVariables) => endSession(client, sessionId, body),
    onSuccess: () => invalidateTrainingData(queryClient),
  });
}

/**
 * `exercise_already_tracked` no es un fallo para quien pulsa "seguir": quiere ese ejercicio
 * en su lista, y ya está. Se resuelve devolviendo la ficha que existe; si estaba archivada
 * se recupera, porque volver a seguirlo es justo lo contrario de archivarlo.
 */
export async function trackExercise(
  client: ApiClient,
  body: CreateTrackedExerciseRequest,
): Promise<TrackedExercise> {
  try {
    return await createTrackedExercise(client, body);
  } catch (error) {
    if (body.origin !== 'catalog' || !isAlreadyTracked(error)) throw error;

    const existing = (await listTrackedExercises(client, { includeArchived: true })).find(
      (exercise) => exercise.catalogId === body.catalogId,
    );
    // El Worker dijo que existe y no aparece: el listado y el alta no cuentan lo mismo, y
    // eso sí es un fallo que hay que ver, no tragarse.
    if (existing === undefined) throw error;

    if (existing.archivedAt === null) return existing;
    return updateTrackedExercise(client, existing.id, { archived: false });
  }
}

function isAlreadyTracked(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === 'exercise_already_tracked';
}
