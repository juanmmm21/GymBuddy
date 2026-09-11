import type {
  Locale,
  MascotState,
  StalledExercise,
  TrackedExercise,
  WeightKilograms,
} from '@gymbuddy/shared';
import {
  formatDaysAgo,
  formatSessionDate,
  formatStopwatch,
  formatTime,
  formatWeightLabel,
  pluralize,
} from '../../lib/format';

/** Lo que dice la mascota: una frase corta que se lee de un vistazo y su explicación. */
export interface MascotMessage {
  readonly title: string;
  readonly body: string;
}

/** Un ejercicio estancado ya con nombre: lo justo para decir qué subir y cuánto. */
export interface StalledExerciseMention {
  readonly name: string;
  readonly suggestedIncrement: WeightKilograms;
}

export interface MascotMessageContext {
  readonly locale: Locale;
  /** El mismo instante con el que se resolvió el estado: decide si una fecha lleva el año. */
  readonly now: Date;
  /**
   * Los estancados del estado, en su orden y con nombre. Puede traer menos de los que dice
   * el estado —los nombres llegan en otra consulta—, y entonces se habla de ellos sin nombrarlos.
   */
  readonly stalled: readonly StalledExerciseMention[];
}

/**
 * Cuántos ejercicios estancados se nombran. Con más, la frase deja de caber en la tarjeta
 * y el resto se cuenta («y 2 más»).
 */
export const MAX_NAMED_STALLED_EXERCISES = 2;

/**
 * El texto de cada estado, con tono de colega: tutea, frases cortas y nada de reproches,
 * ni siquiera tras una semana sin venir. Todo lo que cambia la frase ya viene resuelto en
 * el estado; aquí no se vuelve a decidir si toca descansar o si algo está estancado.
 */
export function mascotMessage(state: MascotState, context: MascotMessageContext): MascotMessage {
  switch (state.mood) {
    case 'celebrating':
      return {
        title: '¡Récord!',
        body: 'Acabas de superarte. Esto se celebra… después de la siguiente serie.',
      };
    case 'resting':
      return {
        title: 'Respira, que te lo has ganado',
        body: `Quedan ${formatStopwatch(state.remainingSeconds)} de descanso. Un trago de agua y a por otra.`,
      };
    case 'cheering':
      return state.reason === 'session_started'
        ? {
            title: '¡Al lío!',
            body: 'Registra la primera serie cuando quieras, que yo no me muevo de aquí.',
          }
        : { title: '¿Seguimos?', body: 'Ya has descansado. La barra no se va a levantar sola.' };
    case 'sleepy':
      return {
        title: 'Zzz… ¿sigues por ahí?',
        body: `${pluralize(state.daysSinceLastSession, 'día', 'días')} sin vernos y me he quedado frito. Con una sesión suave me despiertas.`,
      };
    case 'nudging':
      return nudgingMessage(state, context);
    case 'idle':
      return state.reason === 'never_trained'
        ? {
            title: '¡Buenas! Aquí estoy',
            body: 'Cuando registres tu primera sesión, te voy contando cómo vas.',
          }
        : { title: 'Todo en orden', body: 'Llevas buen ritmo. Cuando toque, aquí me tienes.' };
  }
}

type NudgingState = Extract<MascotState, { readonly mood: 'nudging' }>;

function nudgingMessage(state: NudgingState, context: MascotMessageContext): MascotMessage {
  switch (state.reason) {
    case 'forgotten_session':
      return {
        title: 'Te dejaste la sesión abierta',
        body: `La abriste el ${formatSessionDate(state.openedAt, context.locale, context.now)} a las ${formatTime(state.openedAt, context.locale)}. Si ya acabaste, ciérrala con «Terminar sesión»; si sigues, registra una serie y listo.`,
      };
    case 'absence':
      return {
        title: '¿Hoy toca?',
        body: `La última fue ${formatDaysAgo(state.daysSinceLastSession)}. Aunque sea algo corto, que cuenta igual.`,
      };
    case 'stagnation':
      return stagnationMessage(state.stalledExerciseIds.length, context);
  }
}

function stagnationMessage(stalledCount: number, context: MascotMessageContext): MascotMessage {
  const named = context.stalled.slice(0, MAX_NAMED_STALLED_EXERCISES);
  const [only] = named;

  if (only === undefined) {
    return {
      title: 'Toca subir peso',
      body: 'Hay ejercicios que llevan unas sesiones igual sin perder repeticiones. Ponles un poco más.',
    };
  }

  if (stalledCount === 1) {
    return {
      title: `Toca subir en ${only.name}`,
      body: `Llevas unas sesiones con el mismo peso sin perder repeticiones. Prueba con ${incrementLabel(only, context.locale)}, que puedes.`,
    };
  }

  const mentions = named.map((entry) => `${entry.name} (${incrementLabel(entry, context.locale)})`);
  const unnamed = stalledCount - named.length;
  if (unnamed > 0) mentions.push(`${String(unnamed)} más`);

  return {
    title: 'Toca subir peso',
    body: `${joinWithAnd(mentions)} te lo están pidiendo: unas sesiones igual y sin perder repeticiones.`,
  };
}

/**
 * Empareja los estancados del estado con su nombre y el incremento que sugirió el Worker.
 * Lo que no se encuentra —la lista de ejercicios aún no ha llegado, o no trae ese— se
 * queda fuera: mejor no nombrarlo que inventarle un nombre.
 */
export function stalledMentions(
  stalledExerciseIds: readonly string[],
  stalled: readonly StalledExercise[],
  exercises: readonly TrackedExercise[],
): StalledExerciseMention[] {
  const mentions: StalledExerciseMention[] = [];

  for (const id of stalledExerciseIds) {
    const exercise = exercises.find((candidate) => candidate.id === id);
    const detail = stalled.find((candidate) => candidate.trackedExerciseId === id);
    if (exercise === undefined || detail === undefined) continue;

    mentions.push({ name: exercise.name, suggestedIncrement: detail.suggestedIncrement });
  }

  return mentions;
}

function incrementLabel(mention: StalledExerciseMention, locale: Locale): string {
  return `+${formatWeightLabel(mention.suggestedIncrement, locale)}`;
}

/** «a», «a y b», «a, b y c»: la enumeración tal como se dice. */
function joinWithAnd(items: readonly string[]): string {
  const last = items.at(-1);
  if (last === undefined) return '';
  if (items.length === 1) return last;

  return `${items.slice(0, -1).join(', ')} y ${last}`;
}
