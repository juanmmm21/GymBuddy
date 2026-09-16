import type { VideoConverter, VideoEncodePlan, VideoProbe } from './video-conversion';

/**
 * El conversor de vídeo del navegador: Mediabunny sobre WebCodecs, en TypeScript puro y sin wasm.
 * Se importa a demanda al elegir un vídeo, así que no pesa en el arranque de la app. `null` si el
 * navegador no tiene `VideoEncoder` y `VideoDecoder` (Safari de iOS los tiene desde la 16.4).
 */
export function createBrowserVideoConverter(): VideoConverter | null {
  if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined') return null;

  return {
    async probe(file: Blob): Promise<VideoProbe | null> {
      const { ALL_FORMATS, BlobSource, Input } = await import('mediabunny');
      const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
      try {
        const track = await input.getPrimaryVideoTrack();
        if (track === null) return null;

        const [width, height, durationSeconds, codec] = await Promise.all([
          track.getDisplayWidth(),
          track.getDisplayHeight(),
          input.computeDuration([track]),
          track.getCodec(),
        ]);

        return { width, height, durationSeconds, codec };
      } finally {
        input.dispose();
      }
    },

    async convert(
      file: Blob,
      plan: VideoEncodePlan,
      onProgress: (fraction: number) => void,
    ): Promise<Blob> {
      const {
        ALL_FORMATS,
        BlobSource,
        BufferTarget,
        Conversion,
        Input,
        Mp4OutputFormat,
        Output,
        Quality,
      } = await import('mediabunny');
      const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
      const target = new BufferTarget();
      // `in-memory` deja el índice al principio: el vídeo empieza a verse antes de bajarlo entero.
      const output = new Output({
        format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
        target,
      });

      try {
        const conversion = await Conversion.init({
          input,
          output,
          tracks: 'primary',
          video: {
            width: plan.width,
            height: plan.height,
            fit: 'contain',
            codec: 'avc',
            quality: new Quality(plan.bitrate),
            forceTranscode: true,
            // El giro se hornea en los fotogramas: un reproductor que ignore la metadata no lo tuerce.
            allowRotationMetadata: false,
          },
          // Sin sonido: la técnica no lo necesita y `AudioEncoder` solo existe desde Safari 26.
          audio: { discard: true },
          tags: {},
          showWarnings: false,
        });
        if (!conversion.isValid) {
          const reasons = conversion.discardedTracks
            .map((discarded) => discarded.reason)
            .join(', ');
          throw new Error(`La conversión no es posible en este navegador: ${reasons}`);
        }

        conversion.onProgress = onProgress;
        await conversion.execute();
      } finally {
        input.dispose();
      }

      if (target.buffer === null) throw new Error('La conversión terminó sin fichero');

      return new Blob([target.buffer], { type: 'video/mp4' });
    },
  };
}
