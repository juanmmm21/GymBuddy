import { EXERCISE_VIDEO_BITRATE_BPS } from '@gymbuddy/shared';
import { canEncodeVideo, Quality } from 'mediabunny';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { videoQualityOptions } from '../../src/features/exercises/browser-video-converter';

// Imita lo que responde el codificador por hardware de Safari: acepta H.264 High hasta el nivel 5.2
// con una tasa de bits razonable y rechaza el resto (el modo `quantizer` no lo implementa).
const HIGHEST_ACCEPTED_BITRATE_BPS = 50_000_000;
const ACCEPTED_CODECS = new Set(['avc1.64001f', 'avc1.640020', 'avc1.640028', 'avc1.640029']);

describe('videoQualityOptions', () => {
  const seenConfigs: VideoEncoderConfig[] = [];

  beforeEach(() => {
    seenConfigs.length = 0;
    vi.stubGlobal('VideoEncoder', {
      isConfigSupported: (config: VideoEncoderConfig) => {
        seenConfigs.push(config);
        const supported =
          config.bitrateMode !== 'quantizer' &&
          ACCEPTED_CODECS.has(config.codec) &&
          config.bitrate !== undefined &&
          config.bitrate <= HIGHEST_ACCEPTED_BITRATE_BPS;
        return Promise.resolve({ supported, config });
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('pide 720p vertical a la tasa de bits del contrato con H.264 nivel 3.1', async () => {
    const quality = new Quality(videoQualityOptions(EXERCISE_VIDEO_BITRATE_BPS));

    await expect(canEncodeVideo('avc', { width: 720, height: 1280, quality })).resolves.toBe(true);
    expect(seenConfigs).toHaveLength(1);
    expect(seenConfigs[0]).toMatchObject({
      codec: 'avc1.64001f',
      width: 720,
      height: 1280,
      bitrate: EXERCISE_VIDEO_BITRATE_BPS,
    });
  });

  it('un número suelto en Quality es un nivel cualitativo y rompía la conversión en el iPhone', async () => {
    const quality = new Quality(EXERCISE_VIDEO_BITRATE_BPS);

    // Un tamaño distinto para no reutilizar la respuesta que Mediabunny memoriza por configuración.
    await expect(canEncodeVideo('avc', { width: 1280, height: 720, quality })).resolves.toBe(false);
    expect(seenConfigs.every((config) => config.bitrate !== EXERCISE_VIDEO_BITRATE_BPS)).toBe(true);
  });
});
