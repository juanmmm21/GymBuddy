import { useCallback, useRef, useState, type ChangeEvent } from 'react';
import { ScreenHeader, type BackLink } from '../../app/ScreenHeader';
import { Button, Notice, Surface } from '../../components/index';
import {
  convertVideo,
  VideoConversionError,
  type VideoConversionResult,
} from '../exercises/video-conversion';
import { useVideoConverter } from '../exercises/VideoConverterProvider';
import { SETTINGS_PATH } from './paths';
import styles from './VideoTestScreen.module.css';

const BACK_TO_SETTINGS: BackLink = { to: SETTINGS_PATH, label: 'Ajustes' };

type TestState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'converting'; readonly progress: number | null }
  | { readonly kind: 'done'; readonly original: Blob; readonly result: VideoConversionResult }
  | { readonly kind: 'failed'; readonly message: string };

/**
 * Prueba de convertir un vídeo EN EL MÓVIL, sin subir nada: antes de construir el vídeo de la
 * técnica hay que saber si el iPhone aguanta un vídeo de su cámara (4K en HEVC), cuánto tarda y
 * cuánto pesa lo que sale. Se queda en el dispositivo y se olvida al salir de la pantalla.
 */
export function VideoTestScreen() {
  const converter = useVideoConverter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<TestState>({ kind: 'idle' });

  const handleFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    // Se vacía ya: repetir la prueba con el mismo vídeo tiene que volver a disparar el cambio.
    event.target.value = '';
    if (file === undefined || converter === null) return;

    setState({ kind: 'converting', progress: null });
    try {
      const result = await convertVideo(file, converter, {
        onProgress: (progress) => {
          setState({ kind: 'converting', progress });
        },
      });
      setState({ kind: 'done', original: file, result });
    } catch (error) {
      console.error('La prueba de vídeo falló', error);
      setState({ kind: 'failed', message: describeVideoError(error) });
    }
  };

  const converting = state.kind === 'converting';

  return (
    <>
      <ScreenHeader
        title="Prueba de vídeo"
        subtitle="Convierte un vídeo en este móvil sin subirlo"
        backTo={BACK_TO_SETTINGS}
      />
      <div className={styles.stack}>
        <Surface as="section" aria-label="Qué hace la prueba">
          <p className={styles.text}>
            Elige un vídeo de la cámara de hasta un minuto. El móvil lo pasa a 720p sin sonido, como
            se guardaría en un ejercicio, y enseña cuánto tardó y cuánto pesa. No sale del móvil.
          </p>
        </Surface>

        {converter === null ? (
          <Notice tone="warning" title="Este navegador no puede convertir vídeo">
            Le falta WebCodecs. En un iPhone hace falta iOS 16.4 o posterior.
          </Notice>
        ) : (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="video/*"
              className={styles.fileInput}
              aria-label="Elegir vídeo para la prueba"
              tabIndex={-1}
              onChange={(event) => {
                void handleFile(event);
              }}
            />
            <Button
              fullWidth
              loading={converting}
              disabled={converting}
              onClick={() => {
                inputRef.current?.click();
              }}
            >
              {state.kind === 'idle' ? 'Elegir vídeo' : 'Probar con otro vídeo'}
            </Button>
          </>
        )}

        {state.kind === 'converting' && (
          <p className={styles.status} role="status">
            {state.progress === null
              ? 'Leyendo el vídeo…'
              : `Convirtiendo… ${formatPercent(state.progress)}`}
          </p>
        )}

        {state.kind === 'failed' && (
          <Notice tone="danger" title="La prueba no salió">
            {state.message}
          </Notice>
        )}

        {state.kind === 'done' && (
          <VideoTestReport original={state.original} result={state.result} />
        )}
      </div>
    </>
  );
}

interface VideoTestReportProps {
  readonly original: Blob;
  readonly result: VideoConversionResult;
}

function VideoTestReport({ original, result }: VideoTestReportProps) {
  const { source, target, video, elapsedMs } = result;

  /*
   * La dirección `blob:` vive lo que el reproductor: se libera al quitarlo (limpieza del ref de
   * React 19), o cada prueba dejaría el vídeo entero en memoria.
   */
  const attachVideo = useCallback(
    (player: HTMLVideoElement | null) => {
      if (player === null) return undefined;
      const url = URL.createObjectURL(video);
      player.src = url;

      return () => {
        URL.revokeObjectURL(url);
      };
    },
    [video],
  );

  const rows: readonly (readonly [string, string])[] = [
    ['Original', `${source.width} × ${source.height} · ${source.codec ?? 'códec desconocido'}`],
    ['Duración', formatSeconds(source.durationSeconds)],
    ['Peso original', formatMegabytes(original.size)],
    ['Convertido', `${target.width} × ${target.height} · H.264 sin sonido`],
    ['Peso convertido', formatMegabytes(video.size)],
    ['Tardó', formatSeconds(elapsedMs / 1000)],
  ];

  return (
    <Surface as="section" aria-labelledby="video-test-result">
      <h2 id="video-test-result" className={styles.title}>
        Resultado
      </h2>
      <dl className={styles.report}>
        {rows.map(([label, value]) => (
          <div key={label} className={styles.row}>
            <dt className={styles.label}>{label}</dt>
            <dd className={styles.value}>{value}</dd>
          </div>
        ))}
      </dl>
      <video
        ref={attachVideo}
        className={styles.player}
        controls
        muted
        playsInline
        aria-label="Vídeo convertido"
      />
      <p className={styles.hint}>Reprodúcelo: tiene que verse nítido, fluido y derecho.</p>
    </Surface>
  );
}

const decimal = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function formatMegabytes(bytes: number): string {
  return `${decimal.format(bytes / (1024 * 1024))} MB`;
}

function formatSeconds(seconds: number): string {
  return `${decimal.format(seconds)} s`;
}

function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)} %`;
}

function describeVideoError(error: unknown): string {
  if (!(error instanceof VideoConversionError)) {
    return 'Algo falló de forma inesperada. Prueba otra vez.';
  }

  switch (error.reason) {
    case 'too_long':
      return 'El vídeo pasa del minuto. Recórtalo en Fotos o elige uno más corto.';
    case 'no_video':
      return 'Ese fichero no lleva vídeo.';
    case 'unreadable':
      return 'El móvil no pudo leer ese vídeo.';
    case 'failed':
      return describeCause(error);
  }
}

/** El detalle técnico del fallo se enseña: es justo lo que la prueba quiere averiguar. */
function describeCause(error: VideoConversionError): string {
  const cause = error.cause instanceof Error ? error.cause.message : null;

  return cause === null
    ? 'El móvil empezó a convertir el vídeo pero no pudo terminar.'
    : `El móvil empezó a convertir el vídeo pero no pudo terminar: ${cause}`;
}
