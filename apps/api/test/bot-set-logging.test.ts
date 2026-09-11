import { resourceIdSchema } from '@gymbuddy/shared';
import { env } from 'cloudflare:test';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  matchTrackedExercises,
  MAX_EXERCISE_CHOICES,
  type NamedExercise,
} from '../src/bot/exercise-match';
import { messageResourceId } from '../src/bot/ids';
import {
  catalogChoiceKey,
  decodeSetChoice,
  encodeSetChoice,
  type SetChoice,
} from '../src/bot/set-choice';
import {
  handleSetChoice,
  handleSetMessage,
  type SetMessageOutcome,
  type TelegramTextMessage,
} from '../src/bot/set-logging';
import { formatKilogramsForChat, setMessageReply } from '../src/bot/set-replies';
import type { Database } from '../src/db/client';
import { setEntry, trackedExercise, user, workoutSession } from '../src/db/schema';
import { BENCH_PRESS_ES, seedCatalogSnapshot } from './catalog-fixtures';
import { seedUsers } from './fixtures';

const SENT_AT = new Date('2026-09-11T18:30:00.000Z');
const NOW = new Date('2026-09-11T18:30:02.000Z');
const JUAN_TELEGRAM_ID = 100_001;

const identity = (telegramUserId = JUAN_TELEGRAM_ID) => ({
  telegramUserId,
  firstName: 'Juan',
  username: 'juanmmm21',
  languageCode: 'es',
});

let nextMessageId = 1;

/** Un mensaje nuevo cada vez, como en un chat de verdad: el id no se repite. */
function message(text: string, overrides: Partial<TelegramTextMessage> = {}): TelegramTextMessage {
  nextMessageId += 1;
  return {
    identity: identity(),
    chatId: JUAN_TELEGRAM_ID,
    messageId: nextMessageId,
    text,
    sentAt: SENT_AT,
    ...overrides,
  };
}

function logged(outcome: SetMessageOutcome) {
  if (outcome.kind !== 'logged') {
    throw new Error(`Se esperaba una serie apuntada: ${JSON.stringify(outcome)}`);
  }
  return outcome.logged;
}

describe('registrar una serie desde el bot', () => {
  let db: Database;
  let userId: string;
  let otherUserId: string;

  const track = async (
    name: string,
    extra: Partial<typeof trackedExercise.$inferInsert> = {},
    owner = userId,
  ): Promise<string> => {
    const id = crypto.randomUUID();
    await db.insert(trackedExercise).values({
      id,
      userId: owner,
      catalogId: null,
      customName: name,
      customMuscle: null,
      customBodyPart: null,
      notes: null,
      createdAt: '2026-09-01T08:00:00.000Z',
      archivedAt: null,
      ...extra,
    });
    return id;
  };

  const setsOf = (exerciseId: string) =>
    db.select().from(setEntry).where(eq(setEntry.trackedExerciseId, exerciseId));

  const sessionsOf = (owner: string) =>
    db.select().from(workoutSession).where(eq(workoutSession.userId, owner));

  beforeEach(async () => {
    const seeded = await seedUsers(env.DB);
    db = seeded.db;
    userId = seeded.userId;
    otherUserId = seeded.otherUserId;
    await seedCatalogSnapshot(db);
  });

  it('apunta la serie en su único ejercicio que casa y abre la sesión con la hora del mensaje', async () => {
    const benchId = await track('Press de banca');

    const result = logged(await handleSetMessage(db, message('banca 80x8 rpe8'), NOW));

    expect(result).toEqual({
      exerciseName: 'Press de banca',
      weightGrams: 80_000,
      reps: 8,
      rpeTenths: 80,
      isWarmup: false,
      records: ['max_weight', 'estimated_1rm', 'max_volume'],
      openedSession: true,
      alreadyLogged: false,
    });

    const [stored] = await setsOf(benchId);
    expect(stored).toMatchObject({
      weightGrams: 80_000,
      reps: 8,
      rpeTenths: 80,
      isWarmup: false,
      source: 'bot',
      completedAt: SENT_AT.toISOString(),
    });

    const [session] = await sessionsOf(userId);
    expect(session).toMatchObject({
      source: 'bot',
      startedAt: SENT_AT.toISOString(),
      endedAt: null,
    });
  });

  it('la siguiente serie entra en la misma sesión, sin abrir otra', async () => {
    const benchId = await track('Press de banca');

    await handleSetMessage(db, message('banca 80x8'), NOW);
    const second = logged(await handleSetMessage(db, message('banca 80x7 cal'), NOW));

    expect(second).toMatchObject({ openedSession: false, isWarmup: true, records: [] });
    expect(await setsOf(benchId)).toHaveLength(2);
    expect(await sessionsOf(userId)).toHaveLength(1);
  });

  it('un reenvío del mismo mensaje no duplica la serie', async () => {
    const benchId = await track('Press de banca');
    const sent = message('banca 80x8');

    logged(await handleSetMessage(db, sent, NOW));
    const again = logged(await handleSetMessage(db, sent, NOW));

    expect(again).toMatchObject({ alreadyLogged: true, openedSession: false });
    expect(await setsOf(benchId)).toHaveLength(1);
    expect(await sessionsOf(userId)).toHaveLength(1);
  });

  it('usa la sesión que ya estaba abierta desde la PWA', async () => {
    const benchId = await track('Press de banca');
    const sessionId = crypto.randomUUID();
    await db.insert(workoutSession).values({
      id: sessionId,
      userId,
      startedAt: '2026-09-11T18:00:00.000Z',
      endedAt: null,
      notes: null,
      source: 'web',
    });

    logged(await handleSetMessage(db, message('banca 80x8'), NOW));

    const [stored] = await setsOf(benchId);
    expect(stored?.sessionId).toBe(sessionId);
  });

  describe('sin nombre: el último ejercicio de la sesión abierta', () => {
    it('apunta `80x8` en el ejercicio de la última serie', async () => {
      await track('Press de banca');
      const squatId = await track('Sentadilla');

      await handleSetMessage(db, message('banca 80x8'), NOW);
      await handleSetMessage(db, message('sentadilla 100x5'), NOW);
      const result = logged(await handleSetMessage(db, message('102,5x5 rpe9'), NOW));

      expect(result).toMatchObject({ exerciseName: 'Sentadilla', weightGrams: 102_500, reps: 5 });
      expect(await setsOf(squatId)).toHaveLength(2);
    });

    it('sin sesión abierta pide el ejercicio y no abre nada', async () => {
      await track('Press de banca');

      expect(await handleSetMessage(db, message('80x8'), NOW)).toEqual({ kind: 'needs_exercise' });
      expect(await sessionsOf(userId)).toHaveLength(0);
    });

    it('con la sesión abierta pero vacía también pide el ejercicio', async () => {
      await db.insert(workoutSession).values({
        id: crypto.randomUUID(),
        userId,
        startedAt: '2026-09-11T18:00:00.000Z',
        endedAt: null,
        notes: null,
        source: 'web',
      });

      expect(await handleSetMessage(db, message('80x8'), NOW)).toEqual({ kind: 'needs_exercise' });
    });
  });

  describe('si casan varios ejercicios seguidos, pregunta', () => {
    it('ofrece los que casan, el nombre más corto primero, aunque uno sea exacto', async () => {
      const inclineId = await track('Press de banca inclinado');
      const benchId = await track('Press de banca');
      await track('Sentadilla');

      const outcome = await handleSetMessage(db, message('press de banca 80x8'), NOW);

      expect(outcome).toEqual({
        kind: 'choose_tracked',
        exerciseText: 'press de banca',
        options: [
          { id: benchId, name: 'Press de banca' },
          { id: inclineId, name: 'Press de banca inclinado' },
        ],
        total: 2,
      });
      expect(await sessionsOf(userId)).toHaveLength(0);
    });

    it('al elegir, apunta la serie del mensaje original en el ejercicio elegido', async () => {
      const inclineId = await track('Press de banca inclinado');
      await track('Press de banca');
      const original = message('press banca 60x10 rpe7');

      const result = logged(
        await handleSetChoice(
          db,
          {
            identity: identity(),
            data: encodeSetChoice({ kind: 'tracked', trackedExerciseId: inclineId }),
            original,
          },
          NOW,
        ),
      );

      expect(result).toMatchObject({
        exerciseName: 'Press de banca inclinado',
        weightGrams: 60_000,
        reps: 10,
        rpeTenths: 70,
      });
      const [stored] = await setsOf(inclineId);
      expect(stored?.completedAt).toBe(SENT_AT.toISOString());
    });

    it('pulsar dos veces no duplica, y cambiar de opción para el mismo mensaje no pisa lo apuntado', async () => {
      const inclineId = await track('Press de banca inclinado');
      const benchId = await track('Press de banca');
      const original = message('press banca 60x10');
      const press = (trackedExerciseId: string) =>
        handleSetChoice(
          db,
          {
            identity: identity(),
            data: encodeSetChoice({ kind: 'tracked', trackedExerciseId }),
            original,
          },
          NOW,
        );

      logged(await press(inclineId));
      expect(logged(await press(inclineId)).alreadyLogged).toBe(true);
      expect(await press(benchId)).toEqual({ kind: 'conflict' });

      expect(await setsOf(inclineId)).toHaveLength(1);
      expect(await setsOf(benchId)).toHaveLength(0);
    });

    it('con más opciones de las que caben, ofrece las primeras y cuenta el total', async () => {
      for (let index = 0; index < MAX_EXERCISE_CHOICES + 2; index += 1) {
        await track(`Curl variante ${String(index)}`);
      }

      const outcome = await handleSetMessage(db, message('curl 12x10'), NOW);

      expect(outcome).toMatchObject({ kind: 'choose_tracked', total: MAX_EXERCISE_CHOICES + 2 });
      expect(outcome.kind === 'choose_tracked' && outcome.options).toHaveLength(
        MAX_EXERCISE_CHOICES,
      );
    });
  });

  describe('si solo casa con el catálogo, ofrece elegir', () => {
    it('ofrece los del catálogo sin seguir ninguno', async () => {
      const outcome = await handleSetMessage(db, message('press banca 80x8'), NOW);

      expect(outcome).toEqual({
        kind: 'choose_catalog',
        exerciseText: 'press banca',
        options: [{ catalogId: BENCH_PRESS_ES.id, name: BENCH_PRESS_ES.name }],
      });
      expect(
        await db.select().from(trackedExercise).where(eq(trackedExercise.userId, userId)),
      ).toHaveLength(0);
    });

    it('al elegir, lo sigue y apunta la serie; volver a pulsar no crea otra ficha', async () => {
      const original = message('press banca 80x8');
      const press = () =>
        handleSetChoice(
          db,
          {
            identity: identity(),
            data: encodeSetChoice({
              kind: 'catalog',
              catalogKey: catalogChoiceKey(BENCH_PRESS_ES.id),
            }),
            original,
          },
          NOW,
        );

      const result = logged(await press());
      expect(result).toMatchObject({ exerciseName: BENCH_PRESS_ES.name, openedSession: true });
      expect(logged(await press()).alreadyLogged).toBe(true);

      const followed = await db
        .select()
        .from(trackedExercise)
        .where(
          and(eq(trackedExercise.userId, userId), eq(trackedExercise.catalogId, BENCH_PRESS_ES.id)),
        );
      expect(followed).toHaveLength(1);
      expect(await setsOf(followed[0]?.id ?? '')).toHaveLength(1);
    });

    it('si ya lo seguía archivado, lo recupera en vez de crear otra ficha', async () => {
      const archivedId = await track('', {
        customName: null,
        catalogId: BENCH_PRESS_ES.id,
        archivedAt: '2026-09-05T10:00:00.000Z',
      });

      // Archivado no cuenta como seguido al resolver: sale del catálogo.
      expect(await handleSetMessage(db, message('press banca 80x8'), NOW)).toMatchObject({
        kind: 'choose_catalog',
      });

      const result = logged(
        await handleSetChoice(
          db,
          {
            identity: identity(),
            data: encodeSetChoice({
              kind: 'catalog',
              catalogKey: catalogChoiceKey(BENCH_PRESS_ES.id),
            }),
            original: message('press banca 80x8'),
          },
          NOW,
        ),
      );

      expect(result.exerciseName).toBe(BENCH_PRESS_ES.name);
      const [recovered] = await db
        .select()
        .from(trackedExercise)
        .where(eq(trackedExercise.id, archivedId));
      expect(recovered?.archivedAt).toBeNull();
      expect(await setsOf(archivedId)).toHaveLength(1);
    });

    it('una opción que la búsqueda ya no devuelve no sirve', async () => {
      const outcome = await handleSetChoice(
        db,
        {
          identity: identity(),
          data: encodeSetChoice({
            kind: 'catalog',
            catalogKey: catalogChoiceKey('pectorals/archer-push-up'),
          }),
          original: message('press banca 80x8'),
        },
        NOW,
      );

      expect(outcome).toEqual({ kind: 'stale_choice' });
    });
  });

  it('busca en los dos idiomas del catálogo sobre los ejercicios seguidos', async () => {
    await track('', { customName: null, catalogId: BENCH_PRESS_ES.id });

    const result = logged(await handleSetMessage(db, message('bench press 80x8'), NOW));

    expect(result.exerciseName).toBe(BENCH_PRESS_ES.name);
  });

  it('no encuentra lo que no está ni en sus ejercicios ni en el catálogo', async () => {
    expect(await handleSetMessage(db, message('zumba x10'), NOW)).toEqual({
      kind: 'not_found',
      exerciseText: 'zumba',
    });
  });

  it('devuelve el rechazo del parser sin tocar la base', async () => {
    expect(await handleSetMessage(db, message('banca 80 8'), NOW)).toEqual({
      kind: 'rejected',
      failure: { reason: 'incomplete_set' },
    });
  });

  it('no mira los ejercicios de otro usuario ni acepta un botón con uno ajeno', async () => {
    const othersId = await track('Hip thrust', {}, otherUserId);

    expect(await handleSetMessage(db, message('hip thrust 100x8'), NOW)).toMatchObject({
      kind: 'not_found',
    });

    const outcome = await handleSetChoice(
      db,
      {
        identity: identity(),
        data: encodeSetChoice({ kind: 'tracked', trackedExerciseId: othersId }),
        original: message('hip thrust 100x8'),
      },
      NOW,
    );
    expect(outcome).toEqual({ kind: 'stale_choice' });
    expect(await setsOf(othersId)).toHaveLength(0);
  });

  it('un botón sin mensaje original, con datos inventados o sobre algo que no es una serie no sirve', async () => {
    const benchId = await track('Press de banca');
    const data = encodeSetChoice({ kind: 'tracked', trackedExerciseId: benchId });

    const choose = (press: { data: string; original: TelegramTextMessage | null }) =>
      handleSetChoice(db, { identity: identity(), ...press }, NOW);

    expect(await choose({ data, original: null })).toEqual({ kind: 'stale_choice' });
    expect(await choose({ data: 'set:t:no-es-un-uuid', original: message('banca 80x8') })).toEqual({
      kind: 'stale_choice',
    });
    expect(await choose({ data, original: message('hola') })).toEqual({ kind: 'stale_choice' });
    expect(await choose({ data, original: message('80x8') })).toEqual({ kind: 'stale_choice' });
  });

  it('quien escribe por primera vez sin haber entrado nunca queda dado de alta', async () => {
    const outcome = await handleSetMessage(
      db,
      message('press banca 80x8', { identity: identity(200_300), chatId: 200_300 }),
      NOW,
    );

    expect(outcome.kind).toBe('choose_catalog');
    const [created] = await db.select().from(user).where(eq(user.telegramUserId, 200_300));
    expect(created).toMatchObject({ firstName: 'Juan', locale: 'es' });
  });
});

describe('matchTrackedExercises', () => {
  const exercise = (name: string, searchText = name.toLowerCase()): NamedExercise => ({
    id: crypto.randomUUID(),
    name,
    searchText,
  });

  it('exige todas las palabras en cualquier orden', () => {
    const bench = exercise('Press de banca', 'press de banca');
    const military = exercise('Press militar', 'press militar');

    expect(matchTrackedExercises([bench, military], 'banca press')).toEqual([bench]);
    expect(matchTrackedExercises([bench, military], 'press')).toEqual([military, bench]);
    expect(matchTrackedExercises([bench, military], 'remo')).toEqual([]);
  });

  it('ordena lo que empieza por lo tecleado, luego el nombre corto y luego el alfabético', () => {
    const incline = exercise('Press inclinado con banca', 'press inclinado con banca');
    const bench = exercise('Banca', 'banca');
    const dumbbell = exercise('Banca mancuernas', 'banca mancuernas');
    const barbell = exercise('Banca con barra', 'banca con barra');

    expect(
      matchTrackedExercises([incline, dumbbell, barbell, bench], 'banca').map((item) => item.name),
    ).toEqual(['Banca', 'Banca con barra', 'Banca mancuernas', 'Press inclinado con banca']);
  });

  it('normaliza la consulta como `search_text`', () => {
    const calf = exercise('Elevación de talón', 'elevacion de talon');

    expect(matchTrackedExercises([calf], 'ELEVACIÓN talón')).toEqual([calf]);
    expect(matchTrackedExercises([calf], '—')).toEqual([]);
  });
});

describe('identificadores y botones', () => {
  it('el mismo mensaje da siempre el mismo UUID válido, y cada recurso el suyo', async () => {
    const ref = { chatId: 100_001, messageId: 42 };
    const set = await messageResourceId(ref, 'set');

    expect(resourceIdSchema.safeParse(set).success).toBe(true);
    expect(await messageResourceId(ref, 'set')).toBe(set);
    expect(await messageResourceId(ref, 'session')).not.toBe(set);
    expect(await messageResourceId({ chatId: 100_001, messageId: 43 }, 'set')).not.toBe(set);
    expect(await messageResourceId({ chatId: 100_002, messageId: 42 }, 'set')).not.toBe(set);
  });

  it('el dato de un botón ida y vuelta, y dentro de los 64 bytes de Telegram', () => {
    const choices: SetChoice[] = [
      { kind: 'tracked', trackedExerciseId: crypto.randomUUID() },
      {
        kind: 'catalog',
        catalogKey: catalogChoiceKey('upper-legs/lever-seated-hip-abduction-with-a-very-long-slug'),
      },
    ];

    for (const choice of choices) {
      const data = encodeSetChoice(choice);
      expect(new TextEncoder().encode(data).length).toBeLessThanOrEqual(64);
      expect(decodeSetChoice(data)).toEqual(choice);
    }
  });

  it('rechaza cualquier dato que no haya escrito el bot', () => {
    for (const data of ['', 'set', 'set:t:', 'set:t:123', 'set:c:NO', 'set:c:abc:extra', 'x:t:a']) {
      expect(decodeSetChoice(data)).toBeNull();
    }
  });

  it('la huella del catálogo distingue ejercicios y es estable', () => {
    expect(catalogChoiceKey(BENCH_PRESS_ES.id)).toBe(catalogChoiceKey(BENCH_PRESS_ES.id));
    expect(catalogChoiceKey(BENCH_PRESS_ES.id)).not.toBe(
      catalogChoiceKey('pectorals/archer-push-up'),
    );
  });
});

describe('respuestas del bot al registrar', () => {
  it('cuenta lo apuntado con la coma española', () => {
    const outcome: SetMessageOutcome = {
      kind: 'logged',
      logged: {
        exerciseName: 'Press de banca',
        weightGrams: 82_500,
        reps: 8,
        rpeTenths: 85,
        isWarmup: false,
        records: [],
        openedSession: false,
        alreadyLogged: false,
      },
    };

    expect(setMessageReply(outcome)).toEqual({
      text: 'Apuntada: Press de banca, 82,5 kg × 8, RPE 8,5.',
      buttons: [],
    });
  });

  it('dice si abrió la sesión, si ya estaba apuntada y los récords', () => {
    const reply = setMessageReply({
      kind: 'logged',
      logged: {
        exerciseName: 'Dominadas',
        weightGrams: 0,
        reps: 10,
        rpeTenths: null,
        isWarmup: true,
        records: ['max_weight', 'estimated_1rm'],
        openedSession: true,
        alreadyLogged: true,
      },
    });

    expect(reply.text).toBe(
      'Ya estaba apuntada: Dominadas, 10 repeticiones, calentamiento.\nHe abierto una sesión nueva para ella.\n¡Récord de peso y 1RM estimado!',
    );
  });

  it('pone un botón por opción con el dato de la elección', () => {
    const id = crypto.randomUUID();
    const reply = setMessageReply({
      kind: 'choose_tracked',
      exerciseText: 'banca',
      options: [{ id, name: 'Press de banca' }],
      total: 1,
    });

    expect(reply.buttons).toEqual([
      { text: 'Press de banca', data: encodeSetChoice({ kind: 'tracked', trackedExerciseId: id }) },
    ]);

    const catalog = setMessageReply({
      kind: 'choose_catalog',
      exerciseText: 'press banca',
      options: [{ catalogId: BENCH_PRESS_ES.id, name: BENCH_PRESS_ES.name }],
    });
    expect(catalog.text).toContain('no está entre tus ejercicios');
    expect(decodeSetChoice(catalog.buttons[0]?.data ?? '')).toEqual({
      kind: 'catalog',
      catalogKey: catalogChoiceKey(BENCH_PRESS_ES.id),
    });
  });

  it('tiene un texto para cada rechazo, con lo que falló cuando lo hay', () => {
    const reply = (failure: Extract<SetMessageOutcome, { kind: 'rejected' }>['failure']) =>
      setMessageReply({ kind: 'rejected', failure }).text;

    expect(reply({ reason: 'not_a_set' })).toContain('banca 80x8');
    expect(reply({ reason: 'incomplete_set' })).toContain('con una x');
    expect(reply({ reason: 'multiple_sets' })).toContain('de una en una');
    expect(reply({ reason: 'invalid_weight', text: '10000' })).toContain('«10000»');
    expect(reply({ reason: 'invalid_reps', text: '0' })).toContain('«0»');
    expect(reply({ reason: 'invalid_rpe', text: 'rpe 11' })).toContain('«rpe 11»');
    expect(reply({ reason: 'unexpected_text', text: 'luego' })).toContain('«luego»');
  });

  it('formatea los kilos sin ceros de sobra', () => {
    expect(formatKilogramsForChat(80_000)).toBe('80 kg');
    expect(formatKilogramsForChat(82_500)).toBe('82,5 kg');
    expect(formatKilogramsForChat(81_250)).toBe('81,25 kg');
    expect(formatKilogramsForChat(1_000_000)).toBe('1000 kg');
  });
});
