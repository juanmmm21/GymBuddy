import { apiErrorSchema } from '@gymbuddy/shared';
import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { claimLoginNonce, issueLoginNonce } from '../src/auth/nonce';
import { handleStartCommand, startMessage, type StartOutcome } from '../src/bot/start';
import { createDatabase, type Database } from '../src/db/client';
import { loginNonce, user } from '../src/db/schema';
import { app } from '../src/index';
import { envWithSecrets } from './worker-env';

const NOW = new Date('2026-09-08T12:00:00.000Z');
const minutesAfter = (minutes: number): Date => new Date(NOW.getTime() + minutes * 60_000);

const identity = (
  overrides: Partial<Parameters<typeof handleStartCommand>[1]['identity']> = {},
) => ({
  telegramUserId: 100_001,
  firstName: 'Juan',
  username: 'juanmmm21',
  languageCode: 'es-ES',
  ...overrides,
});

describe('/start del bot', () => {
  let db: Database;

  beforeEach(async () => {
    db = createDatabase(env.DB);
    await db.delete(loginNonce);
    await db.delete(user);
  });

  it('crea el usuario la primera vez y ata el enlace', async () => {
    const { nonce } = await issueLoginNonce(db, NOW);

    const outcome = await handleStartCommand(db, {
      identity: identity(),
      payload: nonce,
      now: minutesAfter(1),
    });

    expect(outcome).toEqual({ kind: 'linked', firstTime: true, firstName: 'Juan' });
    const [created] = await db.select().from(user);
    expect(created?.telegramUserId).toBe(100_001);
    // El idioma sale del de Telegram: "es-ES" es español.
    expect(created?.locale).toBe('es');
  });

  it('no duplica el usuario en la segunda entrada', async () => {
    const first = await issueLoginNonce(db, NOW);
    await handleStartCommand(db, { identity: identity(), payload: first.nonce, now: NOW });

    const second = await issueLoginNonce(db, minutesAfter(20));
    const outcome = await handleStartCommand(db, {
      identity: identity(),
      payload: second.nonce,
      now: minutesAfter(21),
    });

    expect(outcome).toEqual({ kind: 'linked', firstTime: false, firstName: 'Juan' });
    expect(await db.select().from(user)).toHaveLength(1);
  });

  it('refresca el nombre y el alias, que son de Telegram y no nuestros', async () => {
    const first = await issueLoginNonce(db, NOW);
    await handleStartCommand(db, { identity: identity(), payload: first.nonce, now: NOW });

    const second = await issueLoginNonce(db, minutesAfter(20));
    await handleStartCommand(db, {
      identity: identity({ firstName: 'Juanma', username: null }),
      payload: second.nonce,
      now: minutesAfter(21),
    });

    const [row] = await db.select().from(user).where(eq(user.telegramUserId, 100_001));
    expect(row?.firstName).toBe('Juanma');
    expect(row?.username).toBeNull();
  });

  it('arranca en inglés a quien tiene Telegram en otro idioma', async () => {
    const { nonce } = await issueLoginNonce(db, NOW);
    await handleStartCommand(db, {
      identity: identity({ languageCode: 'pt-BR' }),
      payload: nonce,
      now: NOW,
    });

    const [row] = await db.select().from(user);
    expect(row?.locale).toBe('en');
  });

  it('avisa de que el enlace caducó sin dejar la app esperando', async () => {
    const { nonce } = await issueLoginNonce(db, NOW);

    const outcome = await handleStartCommand(db, {
      identity: identity(),
      payload: nonce,
      now: minutesAfter(11),
    });

    expect(outcome).toEqual({ kind: 'nonce_invalid' });
  });

  it('avisa igual con un enlace ya consumido', async () => {
    const { nonce } = await issueLoginNonce(db, NOW);
    await handleStartCommand(db, { identity: identity(), payload: nonce, now: NOW });
    await claimLoginNonce(db, nonce, minutesAfter(1));

    const outcome = await handleStartCommand(db, {
      identity: identity(),
      payload: nonce,
      now: minutesAfter(2),
    });

    expect(outcome).toEqual({ kind: 'nonce_invalid' });
  });

  it('explica cómo entrar a quien abre el bot por su cuenta', async () => {
    const outcome = await handleStartCommand(db, {
      identity: identity(),
      payload: '   ',
      now: NOW,
    });

    expect(outcome).toEqual({ kind: 'no_nonce' });
    // Sin nonce no se crea nada: abrir el bot no es registrarse.
    expect(await db.select().from(user)).toHaveLength(0);
  });

  it('crea el usuario aunque el enlace ya no sirva, para no repetir el alta luego', async () => {
    const { nonce } = await issueLoginNonce(db, NOW);
    await handleStartCommand(db, { identity: identity(), payload: nonce, now: minutesAfter(11) });

    expect(await db.select().from(user)).toHaveLength(1);
  });

  it('no ata el enlace de otro usuario al que escribe', async () => {
    const { nonce } = await issueLoginNonce(db, NOW);
    await handleStartCommand(db, { identity: identity(), payload: nonce, now: NOW });

    const outcome = await handleStartCommand(db, {
      identity: identity({ telegramUserId: 100_002, firstName: 'Otra' }),
      payload: nonce,
      now: minutesAfter(1),
    });

    // El enlace ya tiene dueño; el segundo se lleva un aviso y no la sesión del primero.
    expect(outcome).toEqual({ kind: 'nonce_invalid' });
  });
});

describe('mensajes del bot', () => {
  it('saluda distinto la primera vez', () => {
    const first: StartOutcome = { kind: 'linked', firstTime: true, firstName: 'Juan' };
    const back: StartOutcome = { kind: 'linked', firstTime: false, firstName: 'Juan' };

    expect(startMessage(first)).toContain('¡Hola, Juan!');
    expect(startMessage(back)).toContain('Listo, Juan');
    expect(startMessage({ kind: 'nonce_invalid' })).toContain('ya no vale');
    expect(startMessage({ kind: 'no_nonce' })).toContain('abre GymBuddy');
  });
});

describe('webhook de Telegram', () => {
  const WEBHOOK = 'https://gymbuddy.test/telegram/webhook';
  const TELEGRAM_BOT_TOKEN = '8960424053:token-de-pruebas';
  const TELEGRAM_WEBHOOK_SECRET = 'secreto-del-webhook';

  const webhookEnv = (
    overrides: { TELEGRAM_BOT_TOKEN?: string; TELEGRAM_WEBHOOK_SECRET?: string } = {},
  ): Env => envWithSecrets({ TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, ...overrides });

  const post = (secret?: string): RequestInit => ({
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(secret === undefined ? {} : { 'x-telegram-bot-api-secret-token': secret }),
    },
    body: JSON.stringify({ update_id: 1 }),
  });

  it('no existe sin la cabecera secreta de Telegram', async () => {
    const response = await app.request(WEBHOOK, post(), webhookEnv());

    expect(response.status).toBe(404);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe('not_found');
  });

  it('no distingue un secreto equivocado de una ruta que no existe', async () => {
    const response = await app.request(WEBHOOK, post('otro-secreto'), webhookEnv());

    expect(response.status).toBe(404);
  });

  it('no existe si el bot no está configurado en el Worker', async () => {
    const withoutBot = await app.request(
      WEBHOOK,
      post(TELEGRAM_WEBHOOK_SECRET),
      webhookEnv({ TELEGRAM_BOT_TOKEN: '' }),
    );
    expect(withoutBot.status).toBe(404);

    const withoutSecret = await app.request(
      WEBHOOK,
      post(TELEGRAM_WEBHOOK_SECRET),
      webhookEnv({ TELEGRAM_WEBHOOK_SECRET: '' }),
    );
    expect(withoutSecret.status).toBe(404);
  });

  it('acepta un update con el secreto correcto sin llamar a Telegram', async () => {
    // El update no lleva mensaje, así que ningún handler responde y no sale ni una petición
    // de red: es lo que comprueba que `botInfo` va cableado y grammY no llama a `getMe`.
    const response = await app.request(WEBHOOK, post(TELEGRAM_WEBHOOK_SECRET), webhookEnv());

    expect(response.status).toBe(200);
  });
});
