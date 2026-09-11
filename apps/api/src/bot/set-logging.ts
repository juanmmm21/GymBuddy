import {
  formatGramsAsKilograms,
  resourceIdSchema,
  tenthsToRpe,
  type Locale,
  type PersonalRecordKind,
} from '@gymbuddy/shared';
import { z } from 'zod';
import { findOrCreateTelegramUser, type TelegramIdentity } from '../auth/users';
import { searchCatalogExercises } from '../catalog/repository';
import type { Database } from '../db/client';
import { ApiException } from '../http/errors';
import { createTrackedExercise, updateTrackedExercise } from '../training/exercises';
import { findActiveSession, logSet, startWorkoutSession } from '../training/sessions';
import {
  MAX_EXERCISE_CHOICES,
  findNamedExercise,
  resolveExerciseName,
  type CatalogOption,
  type ExerciseOption,
} from './exercise-match';
import { messageResourceId, type TelegramMessageRef } from './ids';
import { parseSetMessage, type ParsedSet, type SetParseFailure } from './parser';
import { catalogChoiceKey, decodeSetChoice, type SetChoice } from './set-choice';

/**
 * Un mensaje de texto al bot. Como en `/start`, la lógica no sabe de grammY: el handler solo
 * traduce el update a esto y el resultado a una respuesta, y así se prueba contra la D1
 * real sin levantar un bot ni tocar la red.
 */
export interface TelegramTextMessage extends TelegramMessageRef {
  readonly identity: TelegramIdentity;
  readonly text: string;
  /** Cuándo lo escribió el usuario: es el momento de la serie, no el de procesarla. */
  readonly sentAt: Date;
}

export interface LoggedSet {
  readonly exerciseName: string;
  readonly weightGrams: number;
  readonly reps: number;
  readonly rpeTenths: number | null;
  readonly isWarmup: boolean;
  readonly records: readonly PersonalRecordKind[];
  /** Si este mensaje abrió la sesión: la respuesta lo cuenta para que no pille por sorpresa. */
  readonly openedSession: boolean;
  /** Un reenvío del mismo mensaje o un segundo toque del botón: ya estaba apuntada. */
  readonly alreadyLogged: boolean;
}

export type SetMessageOutcome =
  | { readonly kind: 'logged'; readonly logged: LoggedSet }
  | { readonly kind: 'rejected'; readonly failure: SetParseFailure }
  /** `80x8` sin sesión abierta o sin series en ella: no hay «último ejercicio». */
  | { readonly kind: 'needs_exercise' }
  | {
      readonly kind: 'choose_tracked';
      readonly exerciseText: string;
      readonly options: readonly ExerciseOption[];
      readonly total: number;
    }
  | {
      readonly kind: 'choose_catalog';
      readonly exerciseText: string;
      readonly options: readonly CatalogOption[];
    }
  | { readonly kind: 'not_found'; readonly exerciseText: string }
  /**
   * El mensaje ya se apuntó y lo guardado no casa con lo de ahora: se eligió otro ejercicio
   * para el mismo mensaje, o la sesión en la que entró se cerró. Se avisa en vez de pisarlo.
   */
  | { readonly kind: 'conflict' }
  /** El botón ya no sirve: el mensaje original no está o la opción ya no sale. */
  | { readonly kind: 'stale_choice' };

export async function handleSetMessage(
  db: Database,
  message: TelegramTextMessage,
  now: Date,
): Promise<SetMessageOutcome> {
  const parsed = parseSetMessage(message.text);
  if (parsed.kind === 'rejected') return { kind: 'rejected', failure: parsed.failure };

  const { user } = await findOrCreateTelegramUser(db, message.identity, now);
  const set = parsed.set;

  if (set.exercise === null) {
    const last = await findLastExerciseOfOpenSession(db, user.id, user.locale);
    if (last === null) return { kind: 'needs_exercise' };

    return logResolvedSet(db, user.id, message, set, last, now);
  }

  const resolution = await resolveExerciseName(db, user.id, user.locale, set.exercise.query);
  switch (resolution.kind) {
    case 'tracked':
      return logResolvedSet(db, user.id, message, set, resolution.exercise, now);
    case 'ambiguous':
      return {
        kind: 'choose_tracked',
        exerciseText: set.exercise.text,
        options: resolution.options,
        total: resolution.total,
      };
    case 'catalog':
      return {
        kind: 'choose_catalog',
        exerciseText: set.exercise.text,
        options: resolution.options,
      };
    case 'not_found':
      return { kind: 'not_found', exerciseText: set.exercise.text };
  }
}

export interface TelegramSetChoice {
  readonly identity: TelegramIdentity;
  /** El `callback_data` del botón tal y como llega: lo manda el cliente y se valida aquí. */
  readonly data: string;
  /** El mensaje de la serie al que respondían los botones; `null` si Telegram ya no lo da. */
  readonly original: TelegramTextMessage | null;
}

/** Se pulsó uno de los botones de elección de ejercicio. */
export async function handleSetChoice(
  db: Database,
  press: TelegramSetChoice,
  now: Date,
): Promise<SetMessageOutcome> {
  const choice = decodeSetChoice(press.data);
  if (choice === null || press.original === null) return { kind: 'stale_choice' };

  const parsed = parseSetMessage(press.original.text);
  if (parsed.kind === 'rejected' || parsed.set.exercise === null) return { kind: 'stale_choice' };

  const { user } = await findOrCreateTelegramUser(db, press.identity, now);
  const exercise = await exerciseForChoice(
    db,
    user.id,
    user.locale,
    choice,
    parsed.set.exercise.query,
    press.original,
    now,
  );
  if (exercise === null) return { kind: 'stale_choice' };

  return logResolvedSet(db, user.id, press.original, parsed.set, exercise, now);
}

async function exerciseForChoice(
  db: Database,
  userId: string,
  locale: Locale,
  choice: SetChoice,
  query: string,
  original: TelegramMessageRef,
  now: Date,
): Promise<ExerciseOption | null> {
  if (choice.kind === 'tracked') {
    // Filtra por el usuario: un identificador ajeno metido a mano en el botón no existe.
    return findNamedExercise(db, userId, locale, choice.trackedExerciseId);
  }

  const options = await searchCatalogExercises(db, { query, locale, limit: MAX_EXERCISE_CHOICES });
  const picked = options.find((option) => catalogChoiceKey(option.catalogId) === choice.catalogKey);
  if (picked === undefined) return null;

  return followCatalogExercise(db, userId, locale, picked, original, now);
}

const alreadyTrackedDetailSchema = z.object({ trackedExerciseId: resourceIdSchema });

/**
 * Elegir un ejercicio del catálogo lo añade a los del usuario, como «Seguir este ejercicio»
 * en la PWA. Si ya lo seguía archivado, se recupera en vez de fallar: es el mismo
 * ejercicio y su historial tiene que seguir colgando de la misma ficha.
 */
async function followCatalogExercise(
  db: Database,
  userId: string,
  locale: Locale,
  option: CatalogOption,
  original: TelegramMessageRef,
  now: Date,
): Promise<ExerciseOption> {
  try {
    const { exercise } = await createTrackedExercise(
      db,
      userId,
      {
        id: await messageResourceId(original, 'exercise'),
        origin: 'catalog',
        catalogId: option.catalogId,
      },
      locale,
      now,
    );

    return { id: exercise.id, name: exercise.name };
  } catch (error) {
    if (!(error instanceof ApiException) || error.code !== 'exercise_already_tracked') throw error;

    const { trackedExerciseId } = alreadyTrackedDetailSchema.parse(error.detail);
    const exercise = await updateTrackedExercise(
      db,
      userId,
      trackedExerciseId,
      { archived: false },
      locale,
      now,
    );

    return { id: exercise.id, name: exercise.name };
  }
}

/** El ejercicio de la última serie de la sesión abierta, que es lo que significa `80x8`. */
async function findLastExerciseOfOpenSession(
  db: Database,
  userId: string,
  locale: Locale,
): Promise<ExerciseOption | null> {
  const session = await findActiveSession(db, userId);
  // Las series llegan en su `order_index`, que es el orden en que se registraron.
  const lastSet = session?.sets.at(-1);
  if (lastSet === undefined) return null;

  return findNamedExercise(db, userId, locale, lastSet.trackedExerciseId);
}

/**
 * Apunta la serie por las mismas funciones que `POST /sessions` y `POST /sessions/{id}/sets`:
 * récords, idempotencia y comprobación de propiedad salen de ahí y no se duplican aquí.
 */
async function logResolvedSet(
  db: Database,
  userId: string,
  message: TelegramTextMessage,
  set: ParsedSet,
  exercise: ExerciseOption,
  now: Date,
): Promise<SetMessageOutcome> {
  try {
    const session = await ensureOpenSession(db, userId, message, now);
    const result = await logSet(
      db,
      userId,
      session.id,
      {
        id: await messageResourceId(message, 'set'),
        trackedExerciseId: exercise.id,
        weight: formatGramsAsKilograms(set.weightGrams),
        reps: set.reps,
        rpe: set.rpeTenths === null ? null : tenthsToRpe(set.rpeTenths),
        isWarmup: set.isWarmup,
        completedAt: message.sentAt.toISOString(),
        source: 'bot',
      },
      now,
    );

    return {
      kind: 'logged',
      logged: {
        exerciseName: exercise.name,
        weightGrams: set.weightGrams,
        reps: set.reps,
        rpeTenths: set.rpeTenths,
        isWarmup: set.isWarmup,
        records: result.records.map((record) => record.kind),
        openedSession: session.opened,
        alreadyLogged: !result.created,
      },
    };
  } catch (error) {
    if (
      error instanceof ApiException &&
      (error.code === 'conflicting_write' || error.code === 'session_closed')
    ) {
      return { kind: 'conflict' };
    }
    throw error;
  }
}

/**
 * La sesión abierta o una nueva. La nueva lleva el identificador del mensaje, así que un
 * reenvío no abre otra; y si dos mensajes llegan a la vez sin sesión, el que pierde la
 * carrera recibe `session_already_open` y escribe en la que abrió el otro.
 */
async function ensureOpenSession(
  db: Database,
  userId: string,
  message: TelegramTextMessage,
  now: Date,
): Promise<{ id: string; opened: boolean }> {
  const active = await findActiveSession(db, userId);
  if (active !== null) return { id: active.id, opened: false };

  try {
    const { session, created } = await startWorkoutSession(
      db,
      userId,
      {
        id: await messageResourceId(message, 'session'),
        source: 'bot',
        startedAt: message.sentAt.toISOString(),
      },
      now,
    );

    return { id: session.id, opened: created };
  } catch (error) {
    if (!(error instanceof ApiException) || error.code !== 'session_already_open') throw error;

    const winner = await findActiveSession(db, userId);
    if (winner === null) throw error;

    return { id: winner.id, opened: false };
  }
}
