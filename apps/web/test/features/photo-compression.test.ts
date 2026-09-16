import { EXERCISE_MEDIA_MAX_BYTES } from '@gymbuddy/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  compressPhoto,
  photoTargetSize,
  PhotoCompressionError,
  type DecodedPhoto,
  type PhotoCodec,
  type PhotoSize,
} from '../../src/features/exercises/photo-compression';

describe('photoTargetSize', () => {
  it('reduce el lado largo al tope sin deformar', () => {
    expect(photoTargetSize({ width: 4032, height: 3024 }, 1600)).toStrictEqual({
      width: 1600,
      height: 1200,
    });
    expect(photoTargetSize({ width: 3024, height: 4032 }, 1600)).toStrictEqual({
      width: 1200,
      height: 1600,
    });
  });

  it('no agranda una foto que ya cabe', () => {
    expect(photoTargetSize({ width: 800, height: 600 }, 1600)).toStrictEqual({
      width: 800,
      height: 600,
    });
  });

  it('redondea a píxeles enteros y nunca deja un lado a cero', () => {
    expect(photoTargetSize({ width: 10_000, height: 3 }, 1600)).toStrictEqual({
      width: 1600,
      height: 1,
    });
    expect(photoTargetSize({ width: 3000, height: 2001 }, 1600)).toStrictEqual({
      width: 1600,
      height: 1067,
    });
  });
});

interface FakeCodec {
  readonly codec: PhotoCodec;
  readonly close: ReturnType<typeof vi.fn>;
  readonly encoded: { size: PhotoSize; quality: number }[];
}

function fakeCodec(options: {
  readonly source?: PhotoSize;
  readonly output?: Blob;
  readonly decodeError?: Error;
  readonly encodeError?: Error;
}): FakeCodec {
  const close = vi.fn();
  const encoded: { size: PhotoSize; quality: number }[] = [];
  const codec: PhotoCodec = {
    decode: () =>
      options.decodeError === undefined
        ? Promise.resolve({ ...(options.source ?? { width: 4032, height: 3024 }), close })
        : Promise.reject(options.decodeError),
    encodeJpeg: (_photo: DecodedPhoto, size: PhotoSize, quality: number) => {
      encoded.push({ size, quality });
      return options.encodeError === undefined
        ? Promise.resolve(options.output ?? new Blob(['jpeg'], { type: 'image/jpeg' }))
        : Promise.reject(options.encodeError);
    },
  };

  return { codec, close, encoded };
}

const original = new Blob(['heic'], { type: 'image/heic' });

describe('compressPhoto', () => {
  it('redibuja a 1600 px con la calidad del contrato y libera la foto decodificada', async () => {
    const fake = fakeCodec({});

    const photo = await compressPhoto(original, fake.codec);

    expect(photo.type).toBe('image/jpeg');
    expect(fake.encoded).toStrictEqual([{ size: { width: 1600, height: 1200 }, quality: 0.82 }]);
    expect(fake.close).toHaveBeenCalledOnce();
  });

  it('fija el tipo JPEG aunque el codificador no lo ponga', async () => {
    const fake = fakeCodec({ output: new Blob(['jpeg']) });

    expect((await compressPhoto(original, fake.codec)).type).toBe('image/jpeg');
  });

  it('una foto que el móvil no sabe leer falla como ilegible', async () => {
    const fake = fakeCodec({ decodeError: new Error('formato desconocido') });

    await expect(compressPhoto(original, fake.codec)).rejects.toMatchObject({
      name: 'PhotoCompressionError',
      reason: 'unreadable',
    });
  });

  it('si falla al codificar, libera igual la foto decodificada', async () => {
    const fake = fakeCodec({ encodeError: new Error('canvas demasiado grande') });

    await expect(compressPhoto(original, fake.codec)).rejects.toBeInstanceOf(PhotoCompressionError);
    expect(fake.close).toHaveBeenCalledOnce();
  });

  it('rechaza lo que aun reducido pasa del tope del Worker', async () => {
    const heavy = new Blob([new Uint8Array(EXERCISE_MEDIA_MAX_BYTES.photo + 1)], {
      type: 'image/jpeg',
    });
    const fake = fakeCodec({ output: heavy });

    await expect(compressPhoto(original, fake.codec)).rejects.toMatchObject({
      reason: 'too_large',
    });
  });
});
