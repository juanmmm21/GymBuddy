import type { BodyPart, Locale, Muscle } from '@gymbuddy/shared';
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  ActiveSessionResponse,
  BodyPartSummary,
  CatalogExercise,
  CatalogExercisePage,
  CatalogExerciseSummary,
  ExerciseHistory,
  ExerciseStats,
  ResourceId,
  TrackedExercise,
  TrainingSignals,
  User,
  WorkoutSessionDetail,
  WorkoutSessionPage,
} from '@gymbuddy/shared';
import { nextPageOffset } from '../lib/paging';
import { ApiRequestError } from './client';
import {
  fetchActiveSession,
  fetchCatalogExercise,
  fetchCurrentUser,
  fetchExerciseHistory,
  fetchExerciseStats,
  fetchSessionDetail,
  fetchTrainingSignals,
  listBodyParts,
  listCatalogExercises,
  listSessionHistory,
  listTrackedExercises,
  searchCatalog,
  type ListTrackedExercisesOptions,
  type SessionHistoryOptions,
} from './endpoints';
import { useApiClient } from './provider';

/**
 * Claves de caché centralizadas: invalidar "todo lo de sesiones" tras registrar una serie
 * es `queryKeys.sessions.all`, y nadie escribe una clave a mano en una pantalla.
 */
export const queryKeys = {
  currentUser: ['auth', 'me'] as const,
  exercises: {
    all: ['exercises'] as const,
    list: (options: ListTrackedExercisesOptions) => ['exercises', 'list', options] as const,
    history: (exerciseId: ResourceId) => ['exercises', 'history', exerciseId] as const,
  },
  sessions: {
    all: ['sessions'] as const,
    active: ['sessions', 'active'] as const,
    detail: (sessionId: ResourceId) => ['sessions', 'detail', sessionId] as const,
    history: (options: SessionHistoryOptions) => ['sessions', 'history', options] as const,
  },
  stats: {
    all: ['stats'] as const,
    signals: ['stats', 'signals'] as const,
    exercise: (exerciseId: ResourceId) => ['stats', 'exercise', exerciseId] as const,
  },
  catalog: {
    all: ['catalog'] as const,
    bodyParts: (lang: Locale | undefined) => ['catalog', 'bodyparts', lang ?? 'default'] as const,
    exercises: (bodyPart: BodyPart, lang: Locale | undefined) =>
      ['catalog', 'bodypart', bodyPart, lang ?? 'default'] as const,
    search: (q: string, lang: Locale | undefined) =>
      ['catalog', 'search', q, lang ?? 'default'] as const,
    exercise: (muscle: Muscle, slug: string, lang: Locale | undefined) =>
      ['catalog', 'exercise', muscle, slug, lang ?? 'default'] as const,
  },
};

/** Lo que cabe de un tirón en el móvil; coincide con el tamaño por defecto del Worker. */
export const CATALOG_PAGE_SIZE = 50;

/** Con una sola letra la búsqueda devuelve medio catálogo: no merece una petición. */
export const MIN_SEARCH_LENGTH = 2;

/** Un 4xx del contrato no se arregla repitiendo la petición; un corte de red, a veces sí. */
export function shouldRetryRequest(failureCount: number, error: Error): boolean {
  if (error instanceof ApiRequestError) return false;
  return failureCount < 2;
}

export function useCurrentUser(): UseQueryResult<User> {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.currentUser,
    queryFn: () => fetchCurrentUser(client),
    retry: shouldRetryRequest,
  });
}

export function useTrackedExercises(
  options: ListTrackedExercisesOptions = {},
): UseQueryResult<TrackedExercise[]> {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.exercises.list(options),
    queryFn: () => listTrackedExercises(client, options),
    retry: shouldRetryRequest,
  });
}

export function useActiveSession(): UseQueryResult<ActiveSessionResponse> {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.sessions.active,
    queryFn: () => fetchActiveSession(client),
    retry: shouldRetryRequest,
  });
}

/**
 * El historial de sesiones, por páginas que se van acumulando: quien lleva un año
 * entrenando tiene cientos de sesiones y la pantalla no puede pedirlas todas de golpe.
 */
export function useSessionHistory(
  options: SessionHistoryOptions = {},
): UseInfiniteQueryResult<InfiniteData<WorkoutSessionPage>> {
  const client = useApiClient();
  return useInfiniteQuery({
    queryKey: queryKeys.sessions.history(options),
    queryFn: ({ pageParam }) => listSessionHistory(client, { ...options, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: nextPageOffset,
    retry: shouldRetryRequest,
  });
}

/**
 * Una sesión pasada con todas sus series. Es la única consulta que usa `GET /sessions/{id}`:
 * la sesión en curso llega por `/sessions/active`, que ya trae su detalle.
 */
export function useSessionDetail(sessionId: ResourceId): UseQueryResult<WorkoutSessionDetail> {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.sessions.detail(sessionId),
    queryFn: () => fetchSessionDetail(client, sessionId),
    retry: shouldRetryRequest,
  });
}

/**
 * Cómo va un ejercicio: peso habitual, marcas vigentes, puntos de progresión y si está
 * estancado. El Worker decide cuántas sesiones mira (diez por defecto): la ficha no pide
 * más porque el mismo número tiene que salir igual aquí, en el bot y en la mascota.
 */
export function useExerciseStats(exerciseId: ResourceId): UseQueryResult<ExerciseStats> {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.stats.exercise(exerciseId),
    queryFn: () => fetchExerciseStats(client, exerciseId),
    retry: shouldRetryRequest,
  });
}

/** Las últimas sesiones en las que se hizo un ejercicio, con solo sus series de ese ejercicio. */
export function useExerciseHistory(exerciseId: ResourceId): UseQueryResult<ExerciseHistory> {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.exercises.history(exerciseId),
    queryFn: () => fetchExerciseHistory(client, exerciseId),
    retry: shouldRetryRequest,
  });
}

export function useTrainingSignals(): UseQueryResult<TrainingSignals> {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.stats.signals,
    queryFn: () => fetchTrainingSignals(client),
    retry: shouldRetryRequest,
  });
}

export function useBodyParts(lang?: Locale): UseQueryResult<BodyPartSummary[]> {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.catalog.bodyParts(lang),
    queryFn: () => listBodyParts(client, lang),
    retry: shouldRetryRequest,
  });
}

/**
 * Los ejercicios de una parte del cuerpo, por páginas que se van acumulando: `legs` tiene
 * casi trescientos y la pantalla los pide de cincuenta en cincuenta según se baja.
 */
export function useCatalogExercises(
  bodyPart: BodyPart,
  lang?: Locale,
): UseInfiniteQueryResult<InfiniteData<CatalogExercisePage>> {
  const client = useApiClient();
  return useInfiniteQuery({
    queryKey: queryKeys.catalog.exercises(bodyPart, lang),
    queryFn: ({ pageParam }) =>
      listCatalogExercises(client, bodyPart, { lang, limit: CATALOG_PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: nextPageOffset,
    retry: shouldRetryRequest,
  });
}

/**
 * Búsqueda en el catálogo. Por debajo del mínimo la consulta queda desactivada (y en
 * estado pendiente): la pantalla no la pinta hasta que haya algo que buscar. Mientras se
 * teclea se conservan los resultados anteriores para que la lista no parpadee.
 */
export function useCatalogSearch(
  q: string,
  lang?: Locale,
): UseQueryResult<CatalogExerciseSummary[]> {
  const client = useApiClient();
  const term = q.trim();
  return useQuery({
    queryKey: queryKeys.catalog.search(term, lang),
    queryFn: () => searchCatalog(client, term, { lang }),
    enabled: term.length >= MIN_SEARCH_LENGTH,
    placeholderData: keepPreviousData,
    retry: shouldRetryRequest,
  });
}

export function useCatalogExercise(
  muscle: Muscle,
  slug: string,
  lang?: Locale,
): UseQueryResult<CatalogExercise> {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.catalog.exercise(muscle, slug, lang),
    queryFn: () => fetchCatalogExercise(client, muscle, slug, lang),
    retry: shouldRetryRequest,
  });
}
