import { describe, expect, it } from 'vitest';
import { trackedExerciseSchema } from '../src/schemas/exercise';
import {
  EXERCISE_MEDIA_MAX_BYTES,
  exerciseMediaKindForContentType,
  exerciseMediaPath,
  exerciseMediaSchema,
} from '../src/schemas/media';

const MEDIA_ID = '7b0c3d5e-9f1a-4c2b-8d3e-5f6a7b8c9d0e';
const EXERCISE_ID = '1a2b3c4d-5e6f-4a1b-9c2d-3e4f5a6b7c8d';

const photo = {
  id: MEDIA_ID,
  kind: 'photo',
  contentType: 'image/jpeg',
  bytes: 412_000,
  uploadedAt: '2026-09-16T20:00:00.000Z',
} as const;

describe('exerciseMediaKindForContentType', () => {
  it('reconoce el JPEG como foto aunque traiga parámetros o mayúsculas', () => {
    expect(exerciseMediaKindForContentType('image/jpeg')).toBe('photo');
    expect(exerciseMediaKindForContentType('Image/JPEG; charset=binary')).toBe('photo');
  });

  it('reconoce el MP4 como vídeo', () => {
    expect(exerciseMediaKindForContentType('video/mp4')).toBe('video');
    expect(exerciseMediaKindForContentType('VIDEO/MP4; codecs="avc1.64001f"')).toBe('video');
  });

  it('rechaza lo que la PWA no produce: HEIC, PNG o un vídeo sin re-codificar', () => {
    expect(exerciseMediaKindForContentType('image/heic')).toBeNull();
    expect(exerciseMediaKindForContentType('image/png')).toBeNull();
    expect(exerciseMediaKindForContentType('video/quicktime')).toBeNull();
    expect(exerciseMediaKindForContentType('')).toBeNull();
  });
});

describe('exerciseMediaSchema', () => {
  it('admite una foto', () => {
    expect(exerciseMediaSchema.parse(photo)).toStrictEqual(photo);
  });

  it('rechaza un tamaño vacío y una clase desconocida', () => {
    expect(exerciseMediaSchema.safeParse({ ...photo, bytes: 0 }).success).toBe(false);
    expect(exerciseMediaSchema.safeParse({ ...photo, kind: 'audio' }).success).toBe(false);
  });

  it('admite un vídeo', () => {
    const video = { ...photo, kind: 'video', contentType: 'video/mp4', bytes: 11_000_000 };
    expect(exerciseMediaSchema.parse(video)).toStrictEqual(video);
  });

  it('deja los topes muy por debajo de los originales de un iPhone', () => {
    expect(EXERCISE_MEDIA_MAX_BYTES.photo).toBe(3 * 1024 * 1024);
    // Un minuto en 4K de la cámara ronda los 80 MB; re-codificado a 720p, unos 15.
    expect(EXERCISE_MEDIA_MAX_BYTES.video).toBe(40 * 1024 * 1024);
  });
});

describe('trackedExerciseSchema.media', () => {
  const exercise = {
    id: EXERCISE_ID,
    name: 'Hip thrust en máquina',
    origin: 'custom',
    catalogId: null,
    muscle: null,
    bodyPart: 'legs',
    gifUrl: null,
    equipment: null,
    notes: null,
    workingWeight: null,
    lastSet: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    archivedAt: null,
  };

  it('es nulo en un ejercicio guardado en el dispositivo antes de que existiera', () => {
    expect(trackedExerciseSchema.parse(exercise).media).toBeNull();
  });

  it('lleva la foto cuando la hay', () => {
    expect(trackedExerciseSchema.parse({ ...exercise, media: photo }).media).toStrictEqual(photo);
  });
});

describe('exerciseMediaPath', () => {
  it('cuelga de la ficha del ejercicio y cambia con cada subida', () => {
    expect(exerciseMediaPath(EXERCISE_ID, MEDIA_ID)).toBe(
      `/exercises/${EXERCISE_ID}/media/${MEDIA_ID}`,
    );
  });
});
