import {
  activeSessionResponseSchema,
  bodyPartSummarySchema,
  claimSessionResponseSchema,
  exerciseHistorySchema,
  exerciseStatsSchema,
  loginNonceSchema,
  logSetResponseSchema,
  trackedExerciseSchema,
  trainingSignalsSchema,
  userSchema,
  workoutSessionDetailSchema,
  workoutSessionPageSchema,
  workoutSessionSchema,
  type ActiveSessionResponse,
  type BodyPartSummary,
  type ClaimSessionRequest,
  type ClaimSessionResponse,
  type CreateTrackedExerciseRequest,
  type EndSessionRequest,
  type ExerciseHistory,
  type ExerciseStats,
  type Locale,
  type LoginNonce,
  type LogSetRequest,
  type LogSetResponse,
  type StartSessionRequest,
  type TrackedExercise,
  type TrainingSignals,
  type UpdateTrackedExerciseRequest,
  type User,
  type WorkoutSession,
  type WorkoutSessionDetail,
  type WorkoutSessionPage,
} from '@gymbuddy/shared';
import { z } from 'zod';
import type { ApiClient } from './client';

/*
 * Una función por ruta del Worker. Los tipos de entrada y salida son los del contrato de
 * `@gymbuddy/shared`: aquí no se declara ninguna forma de dato, solo se nombran rutas.
 */

const trackedExerciseListSchema = z.array(trackedExerciseSchema);
const bodyPartListSchema = z.array(bodyPartSummarySchema);

export function requestLoginNonce(client: ApiClient): Promise<LoginNonce> {
  return client.request({ method: 'POST', path: '/auth/nonce', schema: loginNonceSchema });
}

export function claimSession(
  client: ApiClient,
  body: ClaimSessionRequest,
): Promise<ClaimSessionResponse> {
  return client.request({
    method: 'POST',
    path: '/auth/claim',
    schema: claimSessionResponseSchema,
    body,
  });
}

export function fetchCurrentUser(client: ApiClient): Promise<User> {
  return client.request({ method: 'GET', path: '/auth/me', schema: userSchema });
}

export interface ListTrackedExercisesOptions {
  readonly lang?: Locale;
  readonly includeArchived?: boolean;
}

export function listTrackedExercises(
  client: ApiClient,
  options: ListTrackedExercisesOptions = {},
): Promise<TrackedExercise[]> {
  return client.request({
    method: 'GET',
    path: '/exercises',
    schema: trackedExerciseListSchema,
    query: { lang: options.lang, includeArchived: options.includeArchived },
  });
}

export function createTrackedExercise(
  client: ApiClient,
  body: CreateTrackedExerciseRequest,
): Promise<TrackedExercise> {
  return client.request({
    method: 'POST',
    path: '/exercises',
    schema: trackedExerciseSchema,
    body,
  });
}

export function updateTrackedExercise(
  client: ApiClient,
  exerciseId: string,
  body: UpdateTrackedExerciseRequest,
): Promise<TrackedExercise> {
  return client.request({
    method: 'PATCH',
    path: `/exercises/${encodeURIComponent(exerciseId)}`,
    schema: trackedExerciseSchema,
    body,
  });
}

export function fetchActiveSession(client: ApiClient): Promise<ActiveSessionResponse> {
  return client.request({
    method: 'GET',
    path: '/sessions/active',
    schema: activeSessionResponseSchema,
  });
}

export function fetchSessionDetail(
  client: ApiClient,
  sessionId: string,
): Promise<WorkoutSessionDetail> {
  return client.request({
    method: 'GET',
    path: `/sessions/${encodeURIComponent(sessionId)}`,
    schema: workoutSessionDetailSchema,
  });
}

export function startSession(
  client: ApiClient,
  body: StartSessionRequest,
): Promise<WorkoutSession> {
  return client.request({ method: 'POST', path: '/sessions', schema: workoutSessionSchema, body });
}

export function logSet(
  client: ApiClient,
  sessionId: string,
  body: LogSetRequest,
): Promise<LogSetResponse> {
  return client.request({
    method: 'POST',
    path: `/sessions/${encodeURIComponent(sessionId)}/sets`,
    schema: logSetResponseSchema,
    body,
  });
}

export function endSession(
  client: ApiClient,
  sessionId: string,
  body: EndSessionRequest = {},
): Promise<WorkoutSession> {
  return client.request({
    method: 'POST',
    path: `/sessions/${encodeURIComponent(sessionId)}/end`,
    schema: workoutSessionSchema,
    body,
  });
}

export interface SessionHistoryOptions {
  readonly limit?: number;
  readonly offset?: number;
  readonly from?: string;
  readonly to?: string;
}

export function listSessionHistory(
  client: ApiClient,
  options: SessionHistoryOptions = {},
): Promise<WorkoutSessionPage> {
  return client.request({
    method: 'GET',
    path: '/history/sessions',
    schema: workoutSessionPageSchema,
    query: { limit: options.limit, offset: options.offset, from: options.from, to: options.to },
  });
}

export function fetchExerciseHistory(
  client: ApiClient,
  exerciseId: string,
  sessions?: number,
): Promise<ExerciseHistory> {
  return client.request({
    method: 'GET',
    path: `/history/exercises/${encodeURIComponent(exerciseId)}`,
    schema: exerciseHistorySchema,
    query: { sessions },
  });
}

export function fetchExerciseStats(
  client: ApiClient,
  exerciseId: string,
  sessions?: number,
): Promise<ExerciseStats> {
  return client.request({
    method: 'GET',
    path: `/stats/exercise/${encodeURIComponent(exerciseId)}`,
    schema: exerciseStatsSchema,
    query: { sessions },
  });
}

export function fetchTrainingSignals(client: ApiClient): Promise<TrainingSignals> {
  return client.request({ method: 'GET', path: '/stats/signals', schema: trainingSignalsSchema });
}

export function listBodyParts(client: ApiClient, lang?: Locale): Promise<BodyPartSummary[]> {
  return client.request({
    method: 'GET',
    path: '/catalog/bodyparts',
    schema: bodyPartListSchema,
    query: { lang },
  });
}
