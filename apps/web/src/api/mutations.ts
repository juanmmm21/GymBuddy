import type {
  CreateRoutineRequest,
  DeviceLink,
  CreateTrackedExerciseRequest,
  EndSessionRequest,
  LogSetRequest,
  LogSetResponse,
  ResourceId,
  Routine,
  StartSessionRequest,
  TrackedExercise,
  UpdateRoutineRequest,
  UpdateSetRequest,
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
  createDeviceLink,
  createRoutine,
  createTrackedExercise,
  endSession,
  listTrackedExercises,
  logSet,
  removeSet,
  startSession,
  updateRoutine,
  updateSet,
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
 * Da de alta una rutina. El identificador lo trae la petición: el formulario lo fija al
 * abrirse, así que reintentar tras un corte devuelve la que ya se creó en vez de duplicarla.
 */
export function useCreateRoutine(): UseMutationResult<Routine, Error, CreateRoutineRequest> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateRoutineRequest) => createRoutine(client, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.routines.all }),
  });
}

export interface UpdateRoutineVariables {
  readonly routineId: ResourceId;
  readonly body: UpdateRoutineRequest;
}

/**
 * Cambia una rutina: nombre, descripción, archivado o la lista entera de ejercicios. La
 * mutación no termina hasta que el listado se ha vuelto a pedir, así que mientras está
 * pendiente la pantalla puede pintar lo que se mandó sin que la lista salte al acabar.
 */
export function useUpdateRoutine(): UseMutationResult<Routine, Error, UpdateRoutineVariables> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ routineId, body }: UpdateRoutineVariables) =>
      updateRoutine(client, routineId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.routines.all }),
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

export interface UpdateSetVariables {
  readonly sessionId: ResourceId;
  readonly setId: ResourceId;
  readonly body: UpdateSetRequest;
}

/**
 * Corrige una serie mal metida. Devuelve las marcas que la corrección haya batido —una
 * serie corregida al alza puede ser un récord— y, al invalidar, la pantalla ve también
 * las que hayan dejado de serlo: eso no viaja en la respuesta, sale de las estadísticas.
 */
export function useUpdateSet(): UseMutationResult<LogSetResponse, Error, UpdateSetVariables> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sessionId, setId, body }: UpdateSetVariables) =>
      updateSet(client, sessionId, setId, body),
    onSuccess: () => invalidateTrainingData(queryClient),
  });
}

export interface RemoveSetVariables {
  readonly sessionId: ResourceId;
  readonly setId: ResourceId;
}

/** Borra una serie. Sus marcas se van con ella en el Worker, así que basta con invalidar. */
export function useRemoveSet(): UseMutationResult<null, Error, RemoveSetVariables> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sessionId, setId }: RemoveSetVariables) => removeSet(client, sessionId, setId),
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
 * Pide el código para sumar otro dispositivo a esta cuenta. No invalida nada: el código no es
 * un dato de la cuenta que otra pantalla esté pintando, es la respuesta de esta pulsación.
 */
export function useCreateDeviceLink(): UseMutationResult<DeviceLink, Error, void> {
  const client = useApiClient();

  return useMutation({ mutationFn: () => createDeviceLink(client) });
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
