import { Bot, InlineKeyboard } from 'grammy';
import type { MaybeInaccessibleMessage, User, UserFromGetMe } from 'grammy/types';
import type { TelegramIdentity } from '../auth/users';
import { createDatabase } from '../db/client';
import {
  handleSetChoice,
  handleSetMessage,
  type SetMessageOutcome,
  type TelegramTextMessage,
} from './set-logging';
import { SET_LOGGING_FAILED_TEXT, setMessageReply, type BotReply } from './set-replies';
import { handleStartCommand, startMessage } from './start';

/**
 * Construye el bot para esta invocación. Los bindings viven en el `env` de la petición, así
 * que el bot no puede guardarse en una variable de módulo y se crea en cada llamada.
 *
 * Se le pasa `botInfo` armado a mano: sin él, grammY llama a `getMe` la primera vez, lo que
 * mete una petición de red en el camino crítico del webhook —y en los tests, que no tocan
 * la red. Los dos datos que necesita son públicos y ya los tenemos.
 */
export function createBot(env: Env, token: string): Bot {
  const bot = new Bot(token, { botInfo: botInfoFrom(token, env.TELEGRAM_BOT_USERNAME) });

  bot.command('start', async (ctx) => {
    const from = ctx.from;
    if (from === undefined) return;

    const outcome = await handleStartCommand(createDatabase(env.DB), {
      identity: identityOf(from),
      // `ctx.match` es lo que Telegram pone tras el comando: el nonce del enlace.
      payload: typeof ctx.match === 'string' ? ctx.match : '',
      now: new Date(),
    });

    await ctx.reply(startMessage(outcome));
  });

  // Solo en chats privados: en un grupo, cualquier mensaje con números se leería como una
  // serie de quien lo escribió, y el historial es personal.
  const privateChat = bot.chatType('private');

  privateChat.on('message:text', async (ctx) => {
    const message: TelegramTextMessage = {
      identity: identityOf(ctx.from),
      chatId: ctx.chat.id,
      messageId: ctx.message.message_id,
      text: ctx.message.text,
      sentAt: new Date(ctx.message.date * 1000),
    };

    const reply = await replyFor(() =>
      handleSetMessage(createDatabase(env.DB), message, new Date()),
    );

    // Se contesta citando el mensaje: al pulsar un botón, la serie se vuelve a leer de ahí.
    await ctx.reply(reply.text, {
      reply_parameters: { message_id: message.messageId, allow_sending_without_reply: true },
      ...(reply.buttons.length === 0 ? {} : { reply_markup: keyboardOf(reply) }),
    });
  });

  privateChat.on('callback_query:data', async (ctx) => {
    const reply = await replyFor(() =>
      handleSetChoice(
        createDatabase(env.DB),
        {
          identity: identityOf(ctx.from),
          data: ctx.callbackQuery.data,
          original: originalSetMessage(ctx.callbackQuery.message, ctx.from),
        },
        new Date(),
      ),
    );

    // Primero se acusa el toque, que si no el botón se queda girando en el móvil; luego el
    // mensaje de las opciones pasa a decir qué se apuntó, y sus botones desaparecen.
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(reply.text, { reply_markup: keyboardOf(reply) });
  });

  // No se instala `bot.catch`: con webhook no llega a actuar (solo cubre long polling), y
  // tenerlo puesto haría creer que los fallos están controlados aquí. El manejo real está
  // en la ruta del webhook, que es la que decide qué código HTTP ve Telegram.
  return bot;
}

/**
 * Un fallo al registrar se le cuenta al usuario: si solo quedara en el log, creería que la
 * serie entró. Se registra igualmente, y si también falla contestar, sube a la ruta.
 */
async function replyFor(run: () => Promise<SetMessageOutcome>): Promise<BotReply> {
  try {
    return setMessageReply(await run());
  } catch (error) {
    console.error('Bot: fallo registrando una serie', error);
    return { text: SET_LOGGING_FAILED_TEXT, buttons: [] };
  }
}

/**
 * El mensaje de la serie al que respondía el de los botones. Telegram lo incluye dentro del
 * mensaje del bot mientras exista; si el usuario lo borró o el mensaje del bot es tan viejo
 * que ya no es accesible, no hay de dónde leer la serie.
 */
function originalSetMessage(
  message: MaybeInaccessibleMessage | undefined,
  from: User,
): TelegramTextMessage | null {
  if (message === undefined || !('reply_to_message' in message)) return null;

  const original = message.reply_to_message;
  if (original?.text === undefined) return null;

  return {
    identity: identityOf(from),
    chatId: original.chat.id,
    messageId: original.message_id,
    text: original.text,
    sentAt: new Date(original.date * 1000),
  };
}

function identityOf(from: User): TelegramIdentity {
  return {
    telegramUserId: from.id,
    firstName: from.first_name,
    username: from.username ?? null,
    languageCode: from.language_code ?? null,
  };
}

/** Un botón por fila: los nombres de ejercicio son largos y dos por fila se cortan. */
function keyboardOf(reply: BotReply): InlineKeyboard {
  return InlineKeyboard.from(
    reply.buttons.map((button) => [InlineKeyboard.text(button.text, button.data)]),
  );
}

/** El id del bot es el número que precede a los dos puntos del token. */
function botInfoFrom(token: string, username: string): UserFromGetMe {
  const [id] = token.split(':');

  return {
    id: Number(id),
    is_bot: true,
    first_name: 'GymBuddy',
    username,
    can_join_groups: false,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
    can_connect_to_business: false,
    has_main_web_app: false,
    has_topics_enabled: false,
    allows_users_to_create_topics: false,
    can_manage_bots: false,
    supports_join_request_queries: false,
  };
}
