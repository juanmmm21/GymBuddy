import { apiErrorSchema, trackedExerciseSchema, type TrackedExercise } from '@gymbuddy/shared';
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { issueSessionToken } from '../src/auth/jwt';
import type { Database } from '../src/db/client';
import { exerciseMedia, mediaUploadMonth, trackedExercise } from '../src/db/schema';
import { app } from '../src/index';
import {
  MEDIA_MONTHLY_UPLOAD_LIMIT,
  MEDIA_STORAGE_BUDGET_BYTES,
  acceptMediaUpload,
  mediaObjectKey,
  uploadMonth,
} from '../src/training/index';
import { seedCatalogSnapshot } from './catalog-fixtures';
import { seedUsers } from './fixtures';
import { envWithSecrets } from './worker-env';

const BASE = 'https://gymbuddy.test/api/v1';
const JWT_SECRET = 'un-secreto-de-sesion-para-las-pruebas';
const BENCH_CATALOG_ID = 'pectorals/barbell-bench-press';

const uuid = (): string => crypto.randomUUID();

/** Bytes sintéticos con la cabecera de un JPEG: el Worker no mira dentro, pero así se reconocen. */
function fakeJpeg(size: number, fill = 7): Uint8Array {
  const bytes = new Uint8Array(size).fill(fill);
  bytes.set([0xff, 0xd8, 0xff], 0);

  return bytes;
}

async function bearer(userId: string): Promise<string> {
  const { token } = await issueSessionToken(userId, JWT_SECRET, new Date());

  return `Bearer ${token}`;
}

async function request(path: string, init: RequestInit): Promise<Response> {
  return app.request(`${BASE}${path}`, init, envWithSecrets({ JWT_SECRET }));
}

async function errorCode(response: Response): Promise<string> {
  return apiErrorSchema.parse(await response.json()).error.code;
}

describe('foto de la técnica de un ejercicio propio', () => {
  let db: Database;
  let userId: string;
  let token: string;
  let otherToken: string;

  beforeEach(async () => {
    const seeded = await seedUsers(env.DB);
    await seedCatalogSnapshot(seeded.db);
    db = seeded.db;
    userId = seeded.userId;
    token = await bearer(seeded.userId);
    otherToken = await bearer(seeded.otherUserId);
  });

  async function createCustom(): Promise<string> {
    const id = uuid();
    const response = await request('/exercises', {
      method: 'POST',
      headers: { authorization: token, 'content-type': 'application/json' },
      body: JSON.stringify({
        id,
        origin: 'custom',
        name: 'Hip thrust en máquina',
        bodyPart: 'legs',
      }),
    });
    expect(response.status).toBe(201);

    return id;
  }

  function upload(
    exerciseId: string,
    body: Uint8Array,
    headers: Record<string, string> = {},
    as = token,
  ): Promise<Response> {
    return request(`/exercises/${exerciseId}/media`, {
      method: 'PUT',
      headers: {
        authorization: as,
        'content-type': 'image/jpeg',
        'content-length': String(body.byteLength),
        ...headers,
      },
      body,
    });
  }

  async function uploadOk(exerciseId: string, body: Uint8Array): Promise<TrackedExercise> {
    const response = await upload(exerciseId, body);
    expect(response.status).toBe(200);

    return trackedExerciseSchema.parse(await response.json());
  }

  async function storedKeys(): Promise<string[]> {
    const listed = await env.MEDIA.list({ prefix: `exercise-media/${userId}/` });

    return listed.objects.map((object) => object.key);
  }

  it('sube la foto, la ficha la trae y el fichero se sirve tal cual', async () => {
    const exerciseId = await createCustom();
    const photo = fakeJpeg(2048);

    const exercise = await uploadOk(exerciseId, photo);
    expect(exercise.media).toMatchObject({ kind: 'photo', contentType: 'image/jpeg', bytes: 2048 });
    const mediaId = exercise.media?.id ?? '';

    const listed = await request('/exercises', { headers: { authorization: token } });
    const found = trackedExerciseSchema
      .array()
      .parse(await listed.json())
      .find((item) => item.id === exerciseId);
    expect(found?.media?.id).toBe(mediaId);

    const file = await request(`/exercises/${exerciseId}/media/${mediaId}`, {
      headers: { authorization: token },
    });
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('image/jpeg');
    expect(file.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
    expect(new Uint8Array(await file.arrayBuffer())).toStrictEqual(photo);
  });

  it('sustituirla deja la dirección vieja en 404 y retira su fichero de R2', async () => {
    const exerciseId = await createCustom();
    const first = await uploadOk(exerciseId, fakeJpeg(1024, 1));
    const second = await uploadOk(exerciseId, fakeJpeg(1500, 2));

    expect(second.media?.id).not.toBe(first.media?.id);
    expect(second.media?.bytes).toBe(1500);
    expect(await storedKeys()).toStrictEqual([mediaObjectKey(userId, second.media?.id ?? '')]);

    const old = await request(`/exercises/${exerciseId}/media/${first.media?.id ?? ''}`, {
      headers: { authorization: token },
    });
    expect(old.status).toBe(404);
  });

  it('quitarla la borra de la ficha y de R2, y repetirlo no falla', async () => {
    const exerciseId = await createCustom();
    await uploadOk(exerciseId, fakeJpeg(800));

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await request(`/exercises/${exerciseId}/media`, {
        method: 'DELETE',
        headers: { authorization: token },
      });
      expect(response.status).toBe(200);
      expect(trackedExerciseSchema.parse(await response.json()).media).toBeNull();
    }
    expect(await storedKeys()).toStrictEqual([]);
  });

  it('un ejercicio del catálogo no lleva foto', async () => {
    const id = uuid();
    await request('/exercises', {
      method: 'POST',
      headers: { authorization: token, 'content-type': 'application/json' },
      body: JSON.stringify({ id, origin: 'catalog', catalogId: BENCH_CATALOG_ID }),
    });

    const response = await upload(id, fakeJpeg(500));

    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe('media_not_allowed');
    expect(await storedKeys()).toStrictEqual([]);
  });

  it('lo de otra cuenta responde 404 al subir, al quitar y al leer', async () => {
    const exerciseId = await createCustom();
    const exercise = await uploadOk(exerciseId, fakeJpeg(600));

    const put = await upload(exerciseId, fakeJpeg(600), {}, otherToken);
    const removed = await request(`/exercises/${exerciseId}/media`, {
      method: 'DELETE',
      headers: { authorization: otherToken },
    });
    const read = await request(`/exercises/${exerciseId}/media/${exercise.media?.id ?? ''}`, {
      headers: { authorization: otherToken },
    });

    expect([put.status, removed.status, read.status]).toStrictEqual([404, 404, 404]);
    expect(await storedKeys()).toHaveLength(1);
  });

  it('rechaza sin guardar nada lo que no es un JPEG, lo que no dice su tamaño y lo que pesa demasiado', async () => {
    const exerciseId = await createCustom();

    const png = await upload(exerciseId, fakeJpeg(500), { 'content-type': 'image/png' });
    expect(png.status).toBe(400);

    const tooLarge = await upload(exerciseId, fakeJpeg(3 * 1024 * 1024 + 1));
    expect(tooLarge.status).toBe(413);
    expect(await errorCode(tooLarge)).toBe('media_too_large');

    expect(await storedKeys()).toStrictEqual([]);
  });

  it('no guarda un cuerpo que no llega con el tamaño declarado', async () => {
    const exerciseId = await createCustom();
    // Un stream y no un array: con un array el runtime corregiría la longitud por su cuenta.
    const shortBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(fakeJpeg(1000));
        controller.close();
      },
    });

    const response = await request(`/exercises/${exerciseId}/media`, {
      method: 'PUT',
      headers: { authorization: token, 'content-type': 'image/jpeg', 'content-length': '2000' },
      body: shortBody,
      duplex: 'half',
    } as RequestInit);

    expect(response.status).toBe(400);
    expect(await storedKeys()).toStrictEqual([]);
    const listed = await request(`/exercises/${exerciseId}`, { headers: { authorization: token } });
    expect(trackedExerciseSchema.parse(await listed.json()).media).toBeNull();
  });

  it('no sube nada si se pasaría del espacio del gratuito, contando todas las cuentas', async () => {
    const exerciseId = await createCustom();
    const bigId = await createCustom();
    await db.insert(exerciseMedia).values({
      trackedExerciseId: bigId,
      userId,
      mediaId: uuid(),
      kind: 'photo',
      contentType: 'image/jpeg',
      bytes: MEDIA_STORAGE_BUDGET_BYTES - 1000,
      uploadedAt: new Date().toISOString(),
    });

    const response = await upload(exerciseId, fakeJpeg(1001));

    expect(response.status).toBe(507);
    expect(await errorCode(response)).toBe('media_quota_exceeded');
    expect(await storedKeys()).toStrictEqual([]);
  });

  it('sustituir una foto no cuenta la vieja contra el espacio', async () => {
    const exerciseId = await createCustom();
    await uploadOk(exerciseId, fakeJpeg(1000));
    const otherId = await createCustom();
    await db.insert(exerciseMedia).values({
      trackedExerciseId: otherId,
      userId,
      mediaId: uuid(),
      kind: 'photo',
      contentType: 'image/jpeg',
      bytes: MEDIA_STORAGE_BUDGET_BYTES - 1500,
      uploadedAt: new Date().toISOString(),
    });

    expect((await upload(exerciseId, fakeJpeg(1400))).status).toBe(200);
  });

  it('cuenta las subidas del mes y se niega al llegar al tope', async () => {
    const exerciseId = await createCustom();
    await uploadOk(exerciseId, fakeJpeg(300));
    await uploadOk(exerciseId, fakeJpeg(300));

    const month = uploadMonth(new Date());
    const [counted] = await db
      .select({ uploads: mediaUploadMonth.uploads })
      .from(mediaUploadMonth)
      .all();
    expect(counted?.uploads).toBe(2);

    await db.delete(mediaUploadMonth);
    await db.insert(mediaUploadMonth).values({ month, uploads: MEDIA_MONTHLY_UPLOAD_LIMIT });

    const response = await upload(exerciseId, fakeJpeg(300));
    expect(response.status).toBe(507);
    expect(await errorCode(response)).toBe('media_quota_exceeded');
  });

  it('borrar la cuenta de un ejercicio se lleva su fila de foto', async () => {
    const exerciseId = await createCustom();
    await uploadOk(exerciseId, fakeJpeg(300));

    await db.delete(trackedExercise);

    expect(await db.select().from(exerciseMedia).all()).toStrictEqual([]);
  });
});

describe('acceptMediaUpload', () => {
  it('acepta un JPEG con su tamaño y normaliza el tipo', () => {
    expect(
      acceptMediaUpload({ contentType: 'image/JPEG; q=1', contentLength: '1234' }),
    ).toStrictEqual({ kind: 'photo', contentType: 'image/jpeg', bytes: 1234 });
  });

  it('exige un tamaño entero y positivo', () => {
    for (const contentLength of [undefined, '', '0', '-3', '12.5', 'mucho']) {
      expect(() => acceptMediaUpload({ contentType: 'image/jpeg', contentLength })).toThrow(
        'Falta el tamaño del fichero o está vacío',
      );
    }
  });

  it('mira el tipo antes que el tamaño', () => {
    expect(() => acceptMediaUpload({ contentType: undefined, contentLength: '10' })).toThrow(
      'Solo se admiten fotos en JPEG',
    );
  });
});
