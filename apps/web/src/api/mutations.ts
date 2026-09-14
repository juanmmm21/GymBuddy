import type {
  CreateRoutineRequest,
  DeviceLink,
  Invitation,
  CreateTrackedExerciseRequest,
  EndSessionRequest,
  LogSetRequest,
  LogSetResponse,
  PersonalRecord,
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
  createInvitation,
  createRoutine,
  createTrackedExercise,
  deleteRoutine,
  deleteSession,
  endSession,
  listTrackedExercises,
  logSet,
  removeSet,
  startSession,
  updateRoutine,
  updateSet,
  updateTrackedExercise,
} from './endpoints';
import type { SubmitOutcome } from '../offline/write-queue';
import { useWriteQueue } from '../offline/WriteQueueProvider';
import { useStorage } from '../app/StorageProvider';
import { forgetSessionRoutineFor } from '../features/session/session-routine-store';
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
 * invalidan juntas porque una serie las mueve todas a la vez. La usa también la cola offline
 * cuando consigue mandar lo que tenía guardado.
 */
export async function invalidateTrainingData(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.exercises.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.stats.all }),
  ]);
}

/**
 * Encolada, la escritura todavía no está en el Worker: releer ahora traería lo de antes y no
 * aportaría nada, porque la pantalla ya la pinta desde la cola. Se relee cuando entra.
 */
function refreshIfSent(queryClient: QueryClient, outcome: SubmitOutcome<unknown>): Promise<void> {
  return outcome.status === 'sent' ? invalidateTrainingData(queryClient) : Promise.resolve();
}

/** El momento de la pulsación, que es cuando pasó aunque la escritura llegue horas después. */
function stampNow(): string {
  return new Date().toISOString();
}

/*
 * Las escrituras de la sesión se piden a la cola offline, que las manda directas si puede y las
 * guarda si no. `networkMode: 'always'`: con el modo por defecto, TanStack Query congela la
 * mutación mientras el navegador dice estar sin red, y lo que se quiere es justo encolarla.
 */

/**
 * Abre una sesión. El identificador lo trae la petición, así que reenviarla devuelve la
 * que ya está abierta en vez de encadenar sesiones vacías.
 */
export function useStartSession(): UseMutationResult<
  SubmitOutcome<WorkoutSession>,
  Error,
  StartSessionRequest
> {
  const client = useApiClient();
  const queue = useWriteQueue();
  const queryClient = useQueryClient();

  return useMutation({
    networkMode: 'always',
    mutationFn: (request: StartSessionRequest) => {
      const body = { ...request, startedAt: request.startedAt ?? stampNow() };
      return queue.submit({ kind: 'start_session', body }, () => startSession(client, body));
    },
    onSuccess: (outcome) => refreshIfSent(queryClient, outcome),
  });
}

export interface LogSetVariables {
  readonly sessionId: ResourceId;
  readonly body: LogSetRequest;
}

/**
 * Registra una serie. La respuesta trae las marcas que acaba de romper para celebrarlas
 * en el momento; en un reenvío llegan vacías porque la marca ya estaba puesta, y encolada
 * no hay respuesta que celebrar.
 */
export function useLogSet(): UseMutationResult<
  SubmitOutcome<LogSetResponse>,
  Error,
  LogSetVariables
> {
  const client = useApiClient();
  const queue = useWriteQueue();
  const queryClient = useQueryClient();

  return useMutation({
    networkMode: 'always',
    mutationFn: ({ sessionId, body: request }: LogSetVariables) => {
      const body = { ...request, completedAt: request.completedAt ?? stampNow() };
      return queue.submit({ kind: 'log_set', sessionId, body }, () =>
        logSet(client, sessionId, body),
      );
    },
    onSuccess: (outcome) => refreshIfSent(queryClient, outcome),
  });
}

/** Las marcas que celebrar: encolada, la serie aún no se ha comparado con nada en el Worker. */
export function freshRecords(outcome: SubmitOutcome<LogSetResponse>): readonly PersonalRecord[] {
  return outcome.status === 'sent' ? outcome.response.records : [];
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
export function useUpdateSet(): UseMutationResult<
  SubmitOutcome<LogSetResponse>,
  Error,
  UpdateSetVariables
> {
  const client = useApiClient();
  const queue = useWriteQueue();
  const queryClient = useQueryClient();

  return useMutation({
    networkMode: 'always',
    mutationFn: ({ sessionId, setId, body }: UpdateSetVariables) =>
      queue.submit({ kind: 'update_set', sessionId, setId, body }, () =>
        updateSet(client, sessionId, setId, body),
      ),
    onSuccess: (outcome) => refreshIfSent(queryClient, outcome),
  });
}

export interface RemoveSetVariables {
  readonly sessionId: ResourceId;
  readonly setId: ResourceId;
}

/** Borra una serie. Sus marcas se van con ella en el Worker, así que basta con invalidar. */
export function useRemoveSet(): UseMutationResult<SubmitOutcome<null>, Error, RemoveSetVariables> {
  const client = useApiClient();
  const queue = useWriteQueue();
  const queryClient = useQueryClient();

  return useMutation({
    networkMode: 'always',
    mutationFn: ({ sessionId, setId }: RemoveSetVariables) =>
      queue.submit({ kind: 'remove_set', sessionId, setId }, () =>
        removeSet(client, sessionId, setId),
      ),
    onSuccess: (outcome) => refreshIfSent(queryClient, outcome),
  });
}

export interface EndSessionVariables {
  readonly sessionId: ResourceId;
  readonly body?: EndSessionRequest;
}

export function useEndSession(): UseMutationResult<
  SubmitOutcome<WorkoutSession>,
  Error,
  EndSessionVariables
> {
  const client = useApiClient();
  const queue = useWriteQueue();
  const queryClient = useQueryClient();

  return useMutation({
    networkMode: 'always',
    mutationFn: ({ sessionId, body: request = {} }: EndSessionVariables) => {
      const body = { ...request, endedAt: request.endedAt ?? stampNow() };
      return queue.submit({ kind: 'end_session', sessionId, body }, () =>
        endSession(client, sessionId, body),
      );
    },
    onSuccess: (outcome) => refreshIfSent(queryClient, outcome),
  });
}

/**
 * Borra una rutina del todo. No pasa por la cola offline, igual que su alta y su edición.
 *
 * Si guiaba la sesión abierta en este móvil, se olvida aquí y no en la pantalla: el editor que
 * lanza el borrado deja de encontrar la rutina en cuanto el listado vuelve y podría desmontarse
 * antes de que corriese un callback suyo. Se invalidan también las estadísticas porque el rango
 * del estancamiento sale de las rutinas que quedan.
 *
 * El `onSuccess` no devuelve la promesa a propósito: TanStack Query la esperaría antes de llamar
 * al `onSuccess` de la pantalla, que es el que navega.
 */
export function useDeleteRoutine(): UseMutationResult<null, Error, ResourceId> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const storage = useStorage();

  return useMutation({
    mutationFn: (routineId: ResourceId) => deleteRoutine(client, routineId),
    onSuccess: (_response, routineId) => {
      forgetSessionRoutineFor(storage, routineId);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.stats.all }),
      ]);
    },
  });
}

/**
 * Borra un entrenamiento ya cerrado. No pasa por la cola offline: se hace desde el historial, que
 * ya necesita red, y un borrado encolado dejaría la sesión viéndose en un móvil y no en el otro.
 *
 * Mueve lo mismo que una serie —historial, peso habitual, señales, semana y marcas—, pero **no**
 * relee el detalle de la sesión borrada: la pantalla que lo pinta sigue montada hasta que navega
 * fuera, y releerlo ahí la llenaría de un «no existe» justo antes de irse. Esa entrada se queda
 * en la caché sin nadie que la pida y la recoge la recolección de TanStack Query.
 *
 * El `onSuccess` no devuelve la promesa a propósito: TanStack Query la esperaría antes de llamar
 * al `onSuccess` de la pantalla, que es el que navega.
 */
export function useDeleteSession(): UseMutationResult<null, Error, ResourceId> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: ResourceId) => deleteSession(client, sessionId),
    onSuccess: (_response, sessionId) => {
      const [, detailScope] = queryKeys.sessions.detail(sessionId);
      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.sessions.all,
          predicate: ({ queryKey }) => queryKey[1] !== detailScope || queryKey[2] !== sessionId,
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.exercises.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.stats.all }),
      ]);
    },
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
 * Pide una invitación para un amigo. Sí invalida: cuántas quedan es un dato que esta misma
 * pantalla está pintando, y acaba de cambiar.
 */
export function useCreateInvitation(): UseMutationResult<Invitation, Error, void> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => createInvitation(client),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.invitations }),
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
