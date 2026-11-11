import type {
  Locale,
  MascotState,
  StalledExercise,
  TrackedExercise,
  WeightKilograms,
} from '@gymbuddy/shared';
import { formatDaysAgo, formatStopwatch, formatWeightLabel } from '../../lib/format';
import { t, plural } from '../../i18n/index';

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
        title: t('¡Récord!', 'Record!'),
        body: t(
          'Acabas de superarte. Esto se celebra… después de la siguiente serie.',
          'You just beat yourself. Time to celebrate… after the next set.',
        ),
      };
    case 'resting':
      return {
        title: t('Respira, que te lo has ganado', 'Breathe, you’ve earned it'),
        body: t(
          `Quedan ${formatStopwatch(state.remainingSeconds)} de descanso. Un trago de agua y a por otra.`,
          `${formatStopwatch(state.remainingSeconds)} of rest left. A sip of water and go again.`,
        ),
      };
    case 'cheering':
      return state.reason === 'session_started'
        ? {
            title: t('¡Al lío!', 'Let’s go!'),
            body: t(
              'Registra la primera serie cuando quieras, que yo no me muevo de aquí.',
              'Log the first set whenever you like, I’m not going anywhere.',
            ),
          }
        : {
            title: t('¿Seguimos?', 'Shall we carry on?'),
            body: t(
              'Ya has descansado. La barra no se va a levantar sola.',
              'You’ve rested. The bar won’t lift itself.',
            ),
          };
    case 'sleepy':
      return {
        title: t('Zzz… ¿sigues por ahí?', 'Zzz… still there?'),
        body: t(
          `${plural(state.daysSinceLastSession, ['día', 'días'], ['day', 'days'])} sin vernos y me he quedado frito. Con una sesión suave me despiertas.`,
          `${plural(state.daysSinceLastSession, ['día', 'días'], ['day', 'days'])} without seeing you and I dozed off. An easy session will wake me up.`,
        ),
      };
    case 'nudging':
      return nudgingMessage(state, context);
    case 'idle':
      return state.reason === 'never_trained'
        ? {
            title: t('¡Buenas! Aquí estoy', 'Hi! Here I am'),
            body: t(
              'Cuando registres tu primera sesión, te voy contando cómo vas.',
              'Once you log your first session, I’ll keep you posted on how you’re doing.',
            ),
          }
        : {
            title: t('Todo en orden', 'All good'),
            body: t(
              'Llevas buen ritmo. Cuando toque, aquí me tienes.',
              'You’re keeping a good pace. When it’s time, I’m here.',
            ),
          };
  }
}

type NudgingState = Extract<MascotState, { readonly mood: 'nudging' }>;

function nudgingMessage(state: NudgingState, context: MascotMessageContext): MascotMessage {
  switch (state.reason) {
    case 'absence':
      return {
        title: t('¿Hoy toca?', 'Training today?'),
        body: t(
          `La última fue ${formatDaysAgo(state.daysSinceLastSession)}. Aunque sea algo corto, que cuenta igual.`,
          `Your last one was ${formatDaysAgo(state.daysSinceLastSession)}. Even something short counts.`,
        ),
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
      title: t('Toca subir peso', 'Time to add weight'),
      body: t(
        'Hay ejercicios que llevan unas sesiones igual sin perder repeticiones. Ponles un poco más.',
        'Some exercises have stayed the same for a few sessions without losing reps. Add a bit more.',
      ),
    };
  }

  if (stalledCount === 1) {
    return {
      title: t(`Toca subir en ${only.name}`, `Time to go up on ${only.name}`),
      body: t(
        `Llevas unas sesiones con el mismo peso sin perder repeticiones. Prueba con ${incrementLabel(only, context.locale)}, que puedes.`,
        `You’ve done a few sessions at the same weight without losing reps. Try ${incrementLabel(only, context.locale)}, you can do it.`,
      ),
    };
  }

  const mentions = named.map((entry) => `${entry.name} (${incrementLabel(entry, context.locale)})`);
  const unnamed = stalledCount - named.length;
  if (unnamed > 0) mentions.push(t(`${String(unnamed)} más`, `${String(unnamed)} more`));

  return {
    title: t('Toca subir peso', 'Time to add weight'),
    body: t(
      `${joinWithAnd(mentions)} te lo están pidiendo: unas sesiones igual y sin perder repeticiones.`,
      `${joinWithAnd(mentions)} are asking for it: a few sessions the same without losing reps.`,
    ),
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

  return `${items.slice(0, -1).join(', ')} ${t('y', 'and')} ${last}`;
}
