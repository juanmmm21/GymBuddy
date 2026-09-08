import type { Locale } from '@gymbuddy/shared';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type {
  ActiveSessionResponse,
  BodyPartSummary,
  TrackedExercise,
  TrainingSignals,
  User,
  WorkoutSessionPage,
} from '@gymbuddy/shared';
import { ApiRequestError } from './client';
import {
  fetchActiveSession,
  fetchCurrentUser,
  fetchTrainingSignals,
  listBodyParts,
  listSessionHistory,
  listTrackedExercises,
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
  },
  sessions: {
    all: ['sessions'] as const,
    active: ['sessions', 'active'] as const,
    history: (options: SessionHistoryOptions) => ['sessions', 'history', options] as const,
  },
  stats: {
    all: ['stats'] as const,
    signals: ['stats', 'signals'] as const,
  },
  catalog: {
    all: ['catalog'] as const,
    bodyParts: (lang: Locale | undefined) => ['catalog', 'bodyparts', lang ?? 'default'] as const,
  },
};

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

export function useSessionHistory(
  options: SessionHistoryOptions = {},
): UseQueryResult<WorkoutSessionPage> {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.sessions.history(options),
    queryFn: () => listSessionHistory(client, options),
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
