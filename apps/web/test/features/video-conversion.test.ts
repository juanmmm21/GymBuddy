import { describe, expect, it } from 'vitest';
import {
  convertVideo,
  VideoConversionError,
  videoTargetSize,
  type VideoConverter,
  type VideoEncodePlan,
  type VideoProbe,
} from '../../src/features/exercises/video-conversion';

describe('videoTargetSize', () => {
  it('baja un 4K vertical u horizontal a 720p sin deformar', () => {
    expect(videoTargetSize({ width: 2160, height: 3840 })).toStrictEqual({
      width: 720,
      height: 1280,
    });
    expect(videoTargetSize({ width: 3840, height: 2160 })).toStrictEqual({
      width: 1280,
      height: 720,
    });
  });

  it('no agranda un vídeo que ya cabe', () => {
    expect(videoTargetSize({ width: 640, height: 360 })).toStrictEqual({ width: 640, height: 360 });
  });

  it('en uno muy apaisado manda el lado largo', () => {
    expect(videoTargetSize({ width: 4000, height: 1000 })).toStrictEqual({
      width: 1280,
      height: 320,
    });
  });

  it('deja los dos lados pares y al menos de dos píxeles', () => {
    expect(videoTargetSize({ width: 1920, height: 1081 })).toStrictEqual({
      width: 1278,
      height: 720,
    });
    expect(videoTargetSize({ width: 641, height: 361 })).toStrictEqual({ width: 640, height: 360 });
    expect(videoTargetSize({ width: 100_000, height: 1 })).toStrictEqual({
      width: 1280,
      height: 2,
    });
  });
});

interface FakeConverter {
  readonly converter: VideoConverter;
  readonly plans: VideoEncodePlan[];
}

const iphoneProbe: VideoProbe = { width: 2160, height: 3840, durationSeconds: 24.5, codec: 'hevc' };

function fakeConverter(options: {
  readonly probe?: VideoProbe | null;
  readonly probeError?: Error;
  readonly convertError?: Error;
  readonly progress?: readonly number[];
}): FakeConverter {
  const plans: VideoEncodePlan[] = [];
  const converter: VideoConverter = {
    probe: () =>
      options.probeError === undefined
        ? Promise.resolve(options.probe === undefined ? iphoneProbe : options.probe)
        : Promise.reject(options.probeError),
    convert: (_file, plan, onProgress) => {
      plans.push(plan);
      for (const fraction of options.progress ?? []) onProgress(fraction);
      return options.convertError === undefined
        ? Promise.resolve(new Blob(['mp4'], { type: 'video/mp4' }))
        : Promise.reject(options.convertError);
    },
  };

  return { converter, plans };
}

const original = new Blob(['mov'], { type: 'video/quicktime' });

describe('convertVideo', () => {
  it('convierte a 720p con la tasa de bits del contrato y mide lo que tardó', async () => {
    const fake = fakeConverter({});
    const clock = [1_000, 9_500];

    const result = await convertVideo(original, fake.converter, {
      now: () => clock.shift() ?? 0,
    });

    expect(fake.plans).toStrictEqual([{ width: 720, height: 1280, bitrate: 2_000_000 }]);
    expect(result.source).toStrictEqual(iphoneProbe);
    expect(result.target).toStrictEqual({ width: 720, height: 1280 });
    expect(result.video.type).toBe('video/mp4');
    expect(result.elapsedMs).toBe(8_500);
  });

  it('pasa el avance acotado entre 0 y 1', async () => {
    const seen: number[] = [];
    const fake = fakeConverter({ progress: [-0.1, 0.5, 1.2] });

    await convertVideo(original, fake.converter, { onProgress: (value) => seen.push(value) });

    expect(seen).toStrictEqual([0, 0.5, 1]);
  });

  it('un minuto justo se admite; un segundo más, no, y ni se intenta convertir', async () => {
    const exact = fakeConverter({ probe: { ...iphoneProbe, durationSeconds: 60 } });
    await expect(convertVideo(original, exact.converter)).resolves.toBeDefined();

    const long = fakeConverter({ probe: { ...iphoneProbe, durationSeconds: 61 } });
    await expect(convertVideo(original, long.converter)).rejects.toMatchObject({
      name: 'VideoConversionError',
      reason: 'too_long',
    });
    expect(long.plans).toHaveLength(0);
  });

  it('un fichero sin vídeo, uno ilegible y una conversión rota fallan cada uno con su motivo', async () => {
    await expect(
      convertVideo(original, fakeConverter({ probe: null }).converter),
    ).rejects.toMatchObject({ reason: 'no_video' });
    await expect(
      convertVideo(original, fakeConverter({ probeError: new Error('contenedor raro') }).converter),
    ).rejects.toMatchObject({ reason: 'unreadable' });

    const cause = new Error('VideoEncoder cerrado');
    const broken = convertVideo(original, fakeConverter({ convertError: cause }).converter);
    await expect(broken).rejects.toBeInstanceOf(VideoConversionError);
    await expect(broken).rejects.toMatchObject({ reason: 'failed', cause });
  });
});
