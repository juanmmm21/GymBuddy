import { Hono } from 'hono';
import { webhookCallback } from 'grammy';
import { createBot } from '../bot/index';
import { ApiException } from '../http/errors';
import { readSecret } from '../http/env';
import { constantTimeEquals } from '../http/secrets';

/**
 * La cabecera que Telegram devuelve con el valor que se le dio al registrar el webhook.
 * Es lo único que distingue un update de Telegram de uno inventado por cualquiera que
 * adivine la URL.
 */
const TELEGRAM_SECRET_HEADER = 'x-telegram-bot-api-secret-token';

/**
 * El webhook va fuera de `/api/v1`: no es parte del contrato de la API, es el canal por el
 * que Telegram nos habla, y su forma la decide Telegram.
 */
export const telegramRoute = new Hono<{ Bindings: Env }>().post('/telegram/webhook', async (c) => {
  const notFound = new ApiException('not_found', 'No existe la ruta solicitada');

  const token = readSecret(c.env, 'TELEGRAM_BOT_TOKEN');
  const webhookSecret = readSecret(c.env, 'TELEGRAM_WEBHOOK_SECRET');

  // Sin bot configurado el webhook no existe, igual que las rutas de administración: es
  // preferible a aceptar updates que luego no se pueden contestar.
  if (token === undefined) throw notFound;
  if (webhookSecret === undefined) throw notFound;

  const provided = c.req.header(TELEGRAM_SECRET_HEADER);
  if (provided === undefined) throw notFound;
  if (!(await constantTimeEquals(provided, webhookSecret))) throw notFound;

  return webhookCallback(createBot(c.env, token), 'hono')(c);
});
