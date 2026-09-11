import { formatGramsAsKilograms, tenthsToRpe, type PersonalRecordKind } from '@gymbuddy/shared';
import { catalogChoiceKey, encodeSetChoice } from './set-choice';
import type { LoggedSet, SetMessageOutcome } from './set-logging';
import type { SetParseFailure } from './parser';

export interface BotButton {
  readonly text: string;
  /** `callback_data`: lo que vuelve al Worker cuando se pulsa. */
  readonly data: string;
}

/**
 * Lo que contesta el bot, sin tipos de grammY: el handler lo convierte en un teclado inline
 * con un botón por fila, y los tests leen texto y botones sin montar un bot.
 */
export interface BotReply {
  readonly text: string;
  readonly buttons: readonly BotButton[];
}

const FORMAT_HELP = 'Escríbeme la serie así: banca 80x8. Si quieres, añade rpe8 o cal.';

const RECORD_NAMES: Record<PersonalRecordKind, string> = {
  max_weight: 'peso',
  estimated_1rm: '1RM estimado',
  max_volume: 'volumen',
};

/** Los textos del bot al registrar, en un solo sitio como los de `/start`. */
export function setMessageReply(outcome: SetMessageOutcome): BotReply {
  switch (outcome.kind) {
    case 'logged':
      return textOnly(loggedText(outcome.logged));
    case 'rejected':
      return textOnly(rejectedText(outcome.failure));
    case 'needs_exercise':
      return textOnly(
        '¿De qué ejercicio? Sin nombre apunto otra serie del último ejercicio de la sesión abierta, y ahora no hay ninguno. Escríbelo delante: banca 80x8.',
      );
    case 'choose_tracked':
      return {
        text:
          outcome.total > outcome.options.length
            ? `«${outcome.exerciseText}» encaja con ${String(outcome.total)} de tus ejercicios. ¿Es alguno de estos? Si no está, escribe más del nombre.`
            : `«${outcome.exerciseText}» encaja con varios de tus ejercicios. ¿Cuál es?`,
        buttons: outcome.options.map((option) => ({
          text: option.name,
          data: encodeSetChoice({ kind: 'tracked', trackedExerciseId: option.id }),
        })),
      };
    case 'choose_catalog':
      return {
        text: `«${outcome.exerciseText}» no está entre tus ejercicios. ¿Es alguno de estos del catálogo? Lo añado a tus ejercicios y apunto la serie.`,
        buttons: outcome.options.map((option) => ({
          text: option.name,
          data: encodeSetChoice({
            kind: 'catalog',
            catalogKey: catalogChoiceKey(option.catalogId),
          }),
        })),
      };
    case 'not_found':
      return textOnly(
        `No encuentro «${outcome.exerciseText}» ni en tus ejercicios ni en el catálogo. Revisa el nombre, o créalo en GymBuddy si es un ejercicio tuyo.`,
      );
    case 'conflict':
      return textOnly(
        'Ese mensaje ya lo había apuntado de otra forma y no lo piso. Si falta la serie, escríbemela otra vez.',
      );
    case 'stale_choice':
      return textOnly('Esa opción ya no sirve. Escríbeme la serie otra vez.');
  }
}

/** Para un fallo nuestro: el usuario tiene que saber que la serie no entró. */
export const SET_LOGGING_FAILED_TEXT =
  'No he podido apuntar la serie por un fallo mío. Prueba otra vez en un momento.';

function loggedText(logged: LoggedSet): string {
  const details = [
    logged.weightGrams === 0
      ? `${String(logged.reps)} repeticiones`
      : `${formatKilogramsForChat(logged.weightGrams)} × ${String(logged.reps)}`,
    ...(logged.rpeTenths === null ? [] : [`RPE ${formatDecimal(tenthsToRpe(logged.rpeTenths))}`]),
    ...(logged.isWarmup ? ['calentamiento'] : []),
  ];

  const lines = [
    `${logged.alreadyLogged ? 'Ya estaba apuntada' : 'Apuntada'}: ${logged.exerciseName}, ${details.join(', ')}.`,
  ];
  if (logged.openedSession) lines.push('He abierto una sesión nueva para ella.');
  if (logged.records.length > 0) {
    lines.push(`¡Récord de ${joinWithAnd(logged.records.map((kind) => RECORD_NAMES[kind]))}!`);
  }

  return lines.join('\n');
}

function rejectedText(failure: SetParseFailure): string {
  switch (failure.reason) {
    case 'not_a_set':
      return `${FORMAT_HELP} Sin peso vale para peso corporal: dominadas x10.`;
    case 'incomplete_set':
      return `No sé leer el peso y las repeticiones. Van juntos con una x, el peso delante y los kilos detrás del peso: banca 80x8 o banca 80kg x 8.`;
    case 'multiple_sets':
      return 'Mándame las series de una en una: un mensaje por serie.';
    case 'invalid_weight':
      return `No puedo apuntar «${failure.text}» como peso. Escríbelo en kilos, como 80 u 82,5.`;
    case 'invalid_reps':
      return `«${failure.text}» no me vale como repeticiones: tiene que ser un número entero, como 8.`;
    case 'invalid_rpe':
      return `«${failure.text}» no me vale: el RPE va de 1 a 10 en medios puntos, como rpe8 o rpe 8,5.`;
    case 'unexpected_text':
      return `No sé qué hacer con «${failure.text}». ${FORMAT_HELP}`;
  }
}

/** «82,5 kg» y no «82.50»: el chat se lee como se habla, con la coma española. */
export function formatKilogramsForChat(grams: number): string {
  const kilograms = formatGramsAsKilograms(grams).replace(/0+$/u, '').replace(/\.$/u, '');
  return `${kilograms.replace('.', ',')} kg`;
}

function formatDecimal(value: number): string {
  // El RPE solo tiene medios puntos, que se escriben exactos: 8 u 8,5.
  return String(value).replace('.', ',');
}

/** «peso, 1RM estimado y volumen»: la última pareja con «y», como se enumera hablando. */
function joinWithAnd(items: readonly string[]): string {
  const last = items.at(-1);
  if (last === undefined || items.length === 1) return last ?? '';

  return `${items.slice(0, -1).join(', ')} y ${last}`;
}

function textOnly(text: string): BotReply {
  return { text, buttons: [] };
}
