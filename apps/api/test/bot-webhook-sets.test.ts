import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { SET_LOGGING_FAILED_TEXT } from '../src/bot/set-replies';
import type { Database } from '../src/db/client';
import { setEntry, trackedExercise } from '../src/db/schema';
import { app } from '../src/index';
import { BENCH_PRESS_ES, seedCatalogSnapshot } from './catalog-fixtures';
import { seedUsers } from './fixtures';
import { envWithSecrets } from './worker-env';

const WEBHOOK = 'https://gymbuddy.test/telegram/webhook';
const TELEGRAM_BOT_TOKEN = '1234567890:token-de-pruebas';
const TELEGRAM_WEBHOOK_SECRET = 'secreto-del-webhook';
const JUAN = { id: 100_001, is_bot: false, first_name: 'Juan', language_code: 'es' };
const PRIVATE_CHAT = { id: JUAN.id, type: 'private', first_name: 'Juan' };
const SENT_AT_SECONDS = 1_789_151_400;

interface TelegramCall {
  readonly method: string;
  readonly payload: Record<string, unknown>;
}

const keyboardSchema = z.object({
  inline_keyboard: z.array(z.array(z.object({ text: z.string(), callback_data: z.string() }))),
});

/**
 * La API de Telegram de mentira: apunta cada llamada y contesta `ok`. Ningún test sale a la
 * red, y así se comprueba lo que el bot contesta de verdad, no solo lo que decide.
 */
function stubTelegram(): TelegramCall[] {
  const calls: TelegramCall[] = [];

  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = url.split('/').at(-1) ?? '';
    const body = typeof init?.body === 'string' ? init.body : '{}';
    calls.push({ method, payload: z.record(z.string(), z.unknown()).parse(JSON.parse(body)) });

    return Promise.resolve(
      Response.json({
        ok: true,
        result:
          method === 'answerCallbackQuery'
            ? true
            : { message_id: 900, date: SENT_AT_SECONDS, chat: PRIVATE_CHAT, text: 'ok' },
      }),
    );
  });

  return calls;
}

function postUpdate(
  update: object,
  workerEnv: Env = envWithSecrets({ TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET }),
) {
  return app.request(
    WEBHOOK,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': TELEGRAM_WEBHOOK_SECRET,
      },
      body: JSON.stringify(update),
    },
    workerEnv,
  );
}

const textUpdate = (messageId: number, text: string, chat: object = PRIVATE_CHAT) => ({
  update_id: messageId,
  message: { message_id: messageId, date: SENT_AT_SECONDS, chat, from: JUAN, text },
});

describe('series por el webhook de Telegram', () => {
  let db: Database;
  let userId: string;

  beforeEach(async () => {
    const seeded = await seedUsers(env.DB);
    db = seeded.db;
    userId = seeded.userId;
    await seedCatalogSnapshot(db);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('apunta la serie y contesta citando el mensaje', async () => {
    const benchId = crypto.randomUUID();
    await db.insert(trackedExercise).values({
      id: benchId,
      userId,
      catalogId: null,
      customName: 'Press de banca',
      customMuscle: null,
      customBodyPart: null,
      notes: null,
      createdAt: '2026-09-01T08:00:00.000Z',
      archivedAt: null,
    });
    const calls = stubTelegram();

    const response = await postUpdate(textUpdate(10, 'banca 82,5x8'));

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: 'sendMessage',
      payload: {
        chat_id: JUAN.id,
        text: 'Apuntada: Press de banca, 82,5 kg × 8.\nHe abierto una sesión nueva para ella.\n¡Récord de peso, 1RM estimado y volumen!',
        reply_parameters: { message_id: 10 },
      },
    });

    const [stored] = await db
      .select()
      .from(setEntry)
      .where(eq(setEntry.trackedExerciseId, benchId));
    expect(stored).toMatchObject({
      weightGrams: 82_500,
      source: 'bot',
      completedAt: new Date(SENT_AT_SECONDS * 1000).toISOString(),
    });
  });

  it('ofrece el catálogo con botones y apunta al pulsar uno', async () => {
    const calls = stubTelegram();

    await postUpdate(textUpdate(20, 'press banca 80x8'));

    const offer = calls[0];
    expect(offer?.method).toBe('sendMessage');
    const keyboard = keyboardSchema.parse(offer?.payload.reply_markup);
    const [[button] = []] = keyboard.inline_keyboard;
    expect(button?.text).toBe(BENCH_PRESS_ES.name);

    const response = await postUpdate({
      update_id: 21,
      callback_query: {
        id: 'toque-1',
        from: JUAN,
        chat_instance: 'instancia',
        data: button?.callback_data,
        message: {
          message_id: 900,
          date: SENT_AT_SECONDS + 1,
          chat: PRIVATE_CHAT,
          from: { id: 1_234_567_890, is_bot: true, first_name: 'GymBuddy' },
          text: 'elige',
          reply_to_message: {
            message_id: 20,
            date: SENT_AT_SECONDS,
            chat: PRIVATE_CHAT,
            from: JUAN,
            text: 'press banca 80x8',
          },
        },
      },
    });

    expect(response.status).toBe(200);
    expect(calls.slice(1).map((call) => call.method)).toEqual([
      'answerCallbackQuery',
      'editMessageText',
    ]);
    const edit = calls[2];
    expect(edit?.payload).toMatchObject({ chat_id: JUAN.id, message_id: 900 });
    expect(String(edit?.payload.text)).toContain(`Apuntada: ${BENCH_PRESS_ES.name}, 80 kg × 8.`);
    expect(keyboardSchema.parse(edit?.payload.reply_markup).inline_keyboard).toEqual([]);

    const [followed] = await db
      .select()
      .from(trackedExercise)
      .where(eq(trackedExercise.catalogId, BENCH_PRESS_ES.id));
    expect(followed?.userId).toBe(userId);
    expect(
      await db
        .select()
        .from(setEntry)
        .where(eq(setEntry.trackedExerciseId, followed?.id ?? '')),
    ).toHaveLength(1);
  });

  it('si falla al registrar, se lo dice al usuario y acusa el update', async () => {
    const calls = stubTelegram();
    // Una D1 que no responde: el fallo tiene que llegar al chat, no quedarse solo en el log.
    const brokenDatabase = {
      prepare: () => {
        throw new Error('D1 no responde');
      },
    } as unknown as D1Database;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await postUpdate(textUpdate(30, 'banca 80x8'), {
      ...envWithSecrets({ TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET }),
      DB: brokenDatabase,
    });

    expect(response.status).toBe(200);
    expect(calls[0]?.payload.text).toBe(SET_LOGGING_FAILED_TEXT);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('no lee series en un grupo', async () => {
    const calls = stubTelegram();

    const response = await postUpdate(
      textUpdate(40, 'banca 80x8', { id: -100_200, type: 'group', title: 'Gimnasio' }),
    );

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(0);
  });
});
