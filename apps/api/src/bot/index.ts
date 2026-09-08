import { Bot } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import { createDatabase } from '../db/client';
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
      identity: {
        telegramUserId: from.id,
        firstName: from.first_name,
        username: from.username ?? null,
        languageCode: from.language_code ?? null,
      },
      // `ctx.match` es lo que Telegram pone tras el comando: el nonce del enlace.
      payload: typeof ctx.match === 'string' ? ctx.match : '',
      now: new Date(),
    });

    await ctx.reply(startMessage(outcome));
  });

  bot.catch((error) => {
    // Un fallo aquí no tiene a quién responder: Telegram solo ve el código HTTP del webhook.
    console.error('Bot: fallo procesando un update', error);
  });

  return bot;
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
