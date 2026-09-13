import {
  activeSessionResponseSchema,
  bodyPartSummarySchema,
  catalogExercisePageSchema,
  catalogExerciseSchema,
  catalogExerciseSummarySchema,
  deviceLinkSchema,
  exerciseHistorySchema,
  exerciseStatsSchema,
  exportSessionPageSchema,
  exportSnapshotSchema,
  importExercisesResponseSchema,
  invitationSchema,
  invitationStatusSchema,
  loginOptionsResponseSchema,
  logSetResponseSchema,
  MAX_EXPORT_SESSION_PAGE_SIZE,
  noContentSchema,
  registrationOptionsResponseSchema,
  routineSchema,
  sessionSchema,
  trackedExerciseSchema,
  trainingSignalsSchema,
  userSchema,
  weeklyCalendarSchema,
  workoutSessionDetailSchema,
  workoutSessionPageSchema,
  workoutSessionSchema,
  type ActiveSessionResponse,
  type BodyPart,
  type BodyPartSummary,
  type CatalogExercise,
  type CatalogExercisePage,
  type CatalogExerciseSummary,
  type CreateRoutineRequest,
  type CreateTrackedExerciseRequest,
  type DeviceLink,
  type DeviceLinkOptionsRequest,
  type EndSessionRequest,
  type ExerciseHistory,
  type ExerciseStats,
  type ExportSessionPage,
  type ExportSnapshot,
  type ImportExercisesRequest,
  type ImportExercisesResponse,
  type ImportRoutinesRequest,
  type ImportSessionsRequest,
  type Invitation,
  type InvitationStatus,
  type Locale,
  type LoginOptionsResponse,
  type LoginVerifyRequest,
  type LogSetRequest,
  type LogSetResponse,
  type Muscle,
  type RegistrationOptionsRequest,
  type RegistrationOptionsResponse,
  type RegistrationVerifyRequest,
  type Routine,
  type Session,
  type StartSessionRequest,
  type UpdateRoutineRequest,
  type UpdateSetRequest,
  type TrackedExercise,
  type TrainingSignals,
  type UpdateTrackedExerciseRequest,
  type User,
  type WeeklyCalendar,
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
const routineListSchema = z.array(routineSchema);
const bodyPartListSchema = z.array(bodyPartSummarySchema);
const catalogSummaryListSchema = z.array(catalogExerciseSummarySchema);

/** Registro, paso 1. La invitación se comprueba, pero no se gasta hasta el paso 2. */
export function requestRegistrationOptions(
  client: ApiClient,
  body: RegistrationOptionsRequest,
): Promise<RegistrationOptionsResponse> {
  return client.request({
    method: 'POST',
    path: '/auth/registration/options',
    schema: registrationOptionsResponseSchema,
    body,
  });
}

/** Registro, paso 2: la llave recién creada a cambio de la cuenta y su sesión. */
export function verifyRegistration(
  client: ApiClient,
  body: RegistrationVerifyRequest,
): Promise<Session> {
  return client.request({
    method: 'POST',
    path: '/auth/registration/verify',
    schema: sessionSchema,
    body,
  });
}

/** Entrada, paso 1. Sin cuerpo: quién entra lo dice la llave, no la petición. */
export function requestLoginOptions(client: ApiClient): Promise<LoginOptionsResponse> {
  return client.request({
    method: 'POST',
    path: '/auth/login/options',
    schema: loginOptionsResponseSchema,
  });
}

/** Entrada, paso 2: la firma del móvil a cambio de la sesión. */
export function verifyLogin(client: ApiClient, body: LoginVerifyRequest): Promise<Session> {
  return client.request({
    method: 'POST',
    path: '/auth/login/verify',
    schema: sessionSchema,
    body,
  });
}

/**
 * Pide el código con el que otro dispositivo se suma a esta cuenta. Lo llama quien ya tiene
 * sesión; el código solo existe en esta respuesta.
 */
export function createDeviceLink(client: ApiClient): Promise<DeviceLink> {
  return client.request({ method: 'POST', path: '/auth/devices/link', schema: deviceLinkSchema });
}

/** Cuántas invitaciones sin usar tiene la cuenta y cuántas más puede generar. */
export function fetchInvitationStatus(client: ApiClient): Promise<InvitationStatus> {
  return client.request({
    method: 'GET',
    path: '/auth/invitations',
    schema: invitationStatusSchema,
  });
}

/** Pide una invitación para un amigo. Como el de dispositivos, el código solo existe aquí. */
export function createInvitation(client: ApiClient): Promise<Invitation> {
  return client.request({ method: 'POST', path: '/auth/invitations', schema: invitationSchema });
}

/** Añadir otro dispositivo, paso 1, desde el nuevo: el código dice de qué cuenta es la llave. */
export function requestDeviceLinkOptions(
  client: ApiClient,
  body: DeviceLinkOptionsRequest,
): Promise<RegistrationOptionsResponse> {
  return client.request({
    method: 'POST',
    path: '/auth/devices/options',
    schema: registrationOptionsResponseSchema,
    body,
  });
}

/** Paso 2: la llave creada a cambio de la sesión de la cuenta que ya existía. */
export function verifyDeviceLink(
  client: ApiClient,
  body: RegistrationVerifyRequest,
): Promise<Session> {
  return client.request({
    method: 'POST',
    path: '/auth/devices/verify',
    schema: sessionSchema,
    body,
  });
}

export function fetchCurrentUser(client: ApiClient): Promise<User> {
  return client.request({ method: 'GET', path: '/auth/me', schema: userSchema });
}

export interface ListTrackedExercisesOptions {
  readonly lang?: Locale | undefined;
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

export interface ListRoutinesOptions {
  readonly includeArchived?: boolean;
}

/** Las rutinas con sus ejercicios ya ordenados: cada línea trae su `orderIndex` resuelto. */
export function listRoutines(
  client: ApiClient,
  options: ListRoutinesOptions = {},
): Promise<Routine[]> {
  return client.request({
    method: 'GET',
    path: '/routines',
    schema: routineListSchema,
    query: { includeArchived: options.includeArchived },
  });
}

/** Da de alta una rutina. Reenviar el mismo identificador responde la que ya existe. */
export function createRoutine(client: ApiClient, body: CreateRoutineRequest): Promise<Routine> {
  return client.request({ method: 'POST', path: '/routines', schema: routineSchema, body });
}

/**
 * Cambia una rutina. Si lleva `items`, la lista se reemplaza entera y el Worker la
 * renumera; sin `items`, las líneas no se tocan. Archivar es `{ archived: true }`.
 */
export function updateRoutine(
  client: ApiClient,
  routineId: string,
  body: UpdateRoutineRequest,
): Promise<Routine> {
  return client.request({
    method: 'PATCH',
    path: `/routines/${encodeURIComponent(routineId)}`,
    schema: routineSchema,
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

/**
 * Corrige una serie ya registrada. Responde lo mismo que registrarla porque corregir al
 * alza también puede batir una marca, y la pantalla la celebra igual.
 */
export function updateSet(
  client: ApiClient,
  sessionId: string,
  setId: string,
  body: UpdateSetRequest,
): Promise<LogSetResponse> {
  return client.request({
    method: 'PATCH',
    path: `/sessions/${encodeURIComponent(sessionId)}/sets/${encodeURIComponent(setId)}`,
    schema: logSetResponseSchema,
    body,
  });
}

/** Borra una serie. El Worker responde 204, así que no hay cuerpo que devolver. */
export function removeSet(client: ApiClient, sessionId: string, setId: string): Promise<null> {
  return client.request({
    method: 'DELETE',
    path: `/sessions/${encodeURIComponent(sessionId)}/sets/${encodeURIComponent(setId)}`,
    schema: noContentSchema,
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

/** La semana en curso día a día. No lleva parámetros: la semana es siempre la de hoy. */
export function fetchWeeklyCalendar(client: ApiClient): Promise<WeeklyCalendar> {
  return client.request({ method: 'GET', path: '/stats/week', schema: weeklyCalendarSchema });
}

export function listBodyParts(client: ApiClient, lang?: Locale): Promise<BodyPartSummary[]> {
  return client.request({
    method: 'GET',
    path: '/catalog/bodyparts',
    schema: bodyPartListSchema,
    query: { lang },
  });
}

export interface CatalogPageOptions {
  readonly lang?: Locale | undefined;
  readonly limit?: number;
  readonly offset?: number;
}

/** Una página de ejercicios de una parte del cuerpo (`bodyPart`, no `muscle`). */
export function listCatalogExercises(
  client: ApiClient,
  bodyPart: BodyPart,
  options: CatalogPageOptions = {},
): Promise<CatalogExercisePage> {
  return client.request({
    method: 'GET',
    path: `/catalog/bodyparts/${bodyPart}`,
    schema: catalogExercisePageSchema,
    query: { lang: options.lang, limit: options.limit, offset: options.offset },
  });
}

export interface CatalogSearchOptions {
  readonly lang?: Locale | undefined;
  readonly limit?: number;
}

export function searchCatalog(
  client: ApiClient,
  q: string,
  options: CatalogSearchOptions = {},
): Promise<CatalogExerciseSummary[]> {
  return client.request({
    method: 'GET',
    path: '/catalog/search',
    schema: catalogSummaryListSchema,
    query: { q, lang: options.lang, limit: options.limit },
  });
}

/**
 * La ficha de un ejercicio del catálogo. El `catalogId` es "{muscle}/{slug}" y viaja
 * partido en dos segmentos, igual que lo espera la ruta del Worker.
 */
export function fetchCatalogExercise(
  client: ApiClient,
  muscle: Muscle,
  slug: string,
  lang?: Locale,
): Promise<CatalogExercise> {
  return client.request({
    method: 'GET',
    path: `/catalog/exercises/${muscle}/${encodeURIComponent(slug)}`,
    schema: catalogExerciseSchema,
    query: { lang },
  });
}

/** Copia de seguridad: una página de sesiones con sus series y sus marcas, de la más antigua a la más reciente. */
export function fetchExportSessionPage(
  client: ApiClient,
  offset: number,
): Promise<ExportSessionPage> {
  return client.request({
    method: 'GET',
    path: '/export/sessions',
    schema: exportSessionPageSchema,
    query: { limit: MAX_EXPORT_SESSION_PAGE_SIZE, offset },
  });
}

/** Copia de seguridad: perfil, ejercicios y rutinas. Se pide después de las sesiones. */
export function fetchExportSnapshot(client: ApiClient): Promise<ExportSnapshot> {
  return client.request({ method: 'GET', path: '/export/snapshot', schema: exportSnapshotSchema });
}

/**
 * Recuperar una copia: un lote de ejercicios. Responde los del catálogo que entraron como
 * propios porque el catálogo de esta cuenta todavía no los tiene.
 */
export function importExercises(
  client: ApiClient,
  body: ImportExercisesRequest,
): Promise<ImportExercisesResponse> {
  return client.request({
    method: 'POST',
    path: '/import/exercises',
    schema: importExercisesResponseSchema,
    body,
  });
}

/** Recuperar una copia: un lote de rutinas con sus líneas. Van después de los ejercicios. */
export function importRoutines(client: ApiClient, body: ImportRoutinesRequest): Promise<null> {
  return client.request({
    method: 'POST',
    path: '/import/routines',
    schema: noContentSchema,
    body,
  });
}

/** Recuperar una copia: un lote de sesiones con sus series y marcas. Van al final. */
export function importSessions(client: ApiClient, body: ImportSessionsRequest): Promise<null> {
  return client.request({
    method: 'POST',
    path: '/import/sessions',
    schema: noContentSchema,
    body,
  });
}
