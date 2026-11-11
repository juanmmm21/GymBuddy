import type { ExerciseMediaKind, ResourceId, TrackedExercise } from '@gymbuddy/shared';
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useRemoveExerciseMedia, useUploadExerciseMedia } from '../../api/mutations';
import { useExerciseMediaFile } from '../../api/queries';
import { Button, Notice, Spinner, Surface } from '../../components/index';
import { describeError } from '../../lib/errors';
import styles from './ExerciseMediaSection.module.css';
import { compressPhoto, PhotoCompressionError } from './photo-compression';
import { usePhotoCodec } from './PhotoCodecProvider';
import { holdScreenAwake, type ReleaseScreen } from './screen-wake';
import { convertVideo, VideoConversionError } from './video-conversion';
import { useVideoConverter } from './VideoConverterProvider';
import { t, intlLocale } from '../../i18n/index';

export interface ExerciseMediaSectionProps {
  readonly exercise: TrackedExercise;
}

/** Lo que se está preparando en el móvil antes de subir; el vídeo lleva su avance (`null` al leerlo). */
type Preparing =
  { readonly kind: 'photo' } | { readonly kind: 'video'; readonly progress: number | null };

function couldNotSave(kind: ExerciseMediaKind): string {
  return kind === 'photo'
    ? t('No se pudo guardar la foto', 'The photo couldn’t be saved')
    : t('No se pudo guardar el vídeo', 'The video couldn’t be saved');
}

function couldNotRemove(kind: ExerciseMediaKind): string {
  return kind === 'photo'
    ? t('No se pudo quitar la foto', 'The photo couldn’t be removed')
    : t('No se pudo quitar el vídeo', 'The video couldn’t be removed');
}

/**
 * La foto o el vídeo de la técnica de un ejercicio propio: los del catálogo ya traen su animación.
 * Un ejercicio lleva uno solo, y el nuevo sustituye al que hubiera. Los dos se re-codifican en el
 * móvil antes de subirlos (lo de la cámara pesa demasiado) y van directos al Worker, fuera de la cola
 * offline: sin red se dice, no se guarda para luego.
 */
export function ExerciseMediaSection({ exercise }: ExerciseMediaSectionProps) {
  const codec = usePhotoCodec();
  const converter = useVideoConverter();
  const upload = useUploadExerciseMedia();
  const remove = useRemoveExerciseMedia();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState<Preparing | null>(null);
  const [uploadingKind, setUploadingKind] = useState<ExerciseMediaKind>('photo');
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  // La pantalla retenida se suelta también al salir de la ficha: sin esto seguiría encendida hasta
  // cerrar la app si se navega a otra pantalla mientras sube.
  const releaseScreenRef = useRef<ReleaseScreen | null>(null);

  useEffect(
    () => () => {
      releaseScreenRef.current?.();
    },
    [],
  );

  const media = exercise.media;
  const busy = preparing !== null || upload.isPending || remove.isPending;

  const startPreparing = (next: Preparing): void => {
    setPrepareError(null);
    upload.reset();
    remove.reset();
    setUploadingKind(next.kind);
    setPreparing(next);
  };

  const handlePhoto = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    // Se vacía ya: elegir otra vez la misma foto tras un fallo tiene que volver a disparar el cambio.
    event.target.value = '';
    if (file === undefined || codec === null) return;

    startPreparing({ kind: 'photo' });
    try {
      const photo = await compressPhoto(file, codec);
      upload.mutate({ exerciseId: exercise.id, file: photo, replacedMediaId: media?.id ?? null });
    } catch (error) {
      console.error('No se pudo preparar la foto', error);
      setPrepareError(describePhotoError(error));
    } finally {
      setPreparing(null);
    }
  };

  const handleVideo = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined || converter === null) return;

    startPreparing({ kind: 'video', progress: null });
    const held = await holdScreenAwake();
    const releaseScreen: ReleaseScreen = () => {
      held();
      releaseScreenRef.current = null;
    };
    releaseScreenRef.current = releaseScreen;
    let converted: Blob;
    try {
      const result = await convertVideo(file, converter, {
        onProgress: (progress) => {
          setPreparing({ kind: 'video', progress });
        },
      });
      converted = result.video;
    } catch (error) {
      releaseScreen();
      console.error('No se pudo convertir el vídeo', error);
      setPrepareError(describeVideoError(error));
      setPreparing(null);
      return;
    }

    setPreparing(null);
    // La pantalla sigue encendida mientras sube: con poca cobertura, unos MB tardan.
    upload.mutate(
      { exerciseId: exercise.id, file: converted, replacedMediaId: media?.id ?? null },
      { onSettled: releaseScreen },
    );
  };

  const error = prepareError ?? (upload.isError ? describeError(upload.error) : null);
  const canChoose = codec !== null || converter !== null;

  return (
    <Surface as="section" aria-label={t('Foto o vídeo de la técnica', 'Technique photo or video')}>
      <h2 className={styles.title}>{t('Técnica', 'Technique')}</h2>

      <div className={styles.stack}>
        {media === null ? (
          <p className={styles.hint}>
            {t(
              'Pon una foto o un vídeo de cómo se hace para acordarte la próxima vez.',
              'Add a photo or video of how it’s done so you remember next time.',
            )}
          </p>
        ) : media.kind === 'video' ? (
          <ExerciseVideo exerciseId={exercise.id} mediaId={media.id} name={exercise.name} />
        ) : (
          <ExercisePhoto exerciseId={exercise.id} mediaId={media.id} name={exercise.name} />
        )}

        {preparing?.kind === 'photo' && (
          <p className={styles.status} role="status">
            {t('Preparando la foto…', 'Preparing the photo…')}
          </p>
        )}
        {preparing?.kind === 'video' && (
          <Notice tone="warning" title={describeVideoProgress(preparing.progress)}>
            {t(
              'No salgas de la app ni bloquees el móvil hasta que termine: el vídeo se convierte aquí y tarda más o menos el doble de lo que dura.',
              'Don’t leave the app or lock your phone until it finishes: the video is converted here and takes about twice its length.',
            )}
          </Notice>
        )}
        {upload.isPending && uploadingKind === 'video' && (
          <p className={styles.status} role="status">
            {t('Subiendo el vídeo…', 'Uploading the video…')}
          </p>
        )}

        {error !== null && (
          <Notice tone="danger" title={couldNotSave(uploadingKind)}>
            {error}
          </Notice>
        )}
        {remove.isError && media !== null && (
          <Notice tone="danger" title={couldNotRemove(media.kind)}>
            {describeError(remove.error)}
          </Notice>
        )}

        {codec === null && (
          <p className={styles.hint}>
            {t(
              'Este navegador no puede preparar fotos para subirlas.',
              'This browser can’t prepare photos for upload.',
            )}
          </p>
        )}
        {converter === null && (
          <p className={styles.hint}>
            {t(
              'Este navegador no puede convertir vídeos para subirlos.',
              'This browser can’t convert videos for upload.',
            )}
          </p>
        )}

        {codec !== null && (
          <input
            ref={photoInputRef}
            type="file"
            // Con `image/*` Safari de iOS ofrece la cámara y la fototeca, y entrega el HEIC ya en JPEG.
            accept="image/*"
            className={styles.fileInput}
            aria-label={t('Elegir foto de la técnica', 'Choose technique photo')}
            tabIndex={-1}
            onChange={(event) => {
              void handlePhoto(event);
            }}
          />
        )}
        {converter !== null && (
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            className={styles.fileInput}
            aria-label={t('Elegir vídeo de la técnica', 'Choose technique video')}
            tabIndex={-1}
            onChange={(event) => {
              void handleVideo(event);
            }}
          />
        )}

        {confirmingRemoval && media !== null ? (
          <Notice
            tone="warning"
            title={
              media.kind === 'video'
                ? t('¿Quitar el vídeo?', 'Remove the video?')
                : t('¿Quitar la foto?', 'Remove the photo?')
            }
            action={
              <div className={styles.actions}>
                <Button
                  variant="danger"
                  loading={remove.isPending}
                  onClick={() => {
                    upload.reset();
                    remove.mutate(
                      { exerciseId: exercise.id, mediaId: media.id },
                      {
                        onSuccess: () => {
                          setConfirmingRemoval(false);
                        },
                      },
                    );
                  }}
                >
                  {media.kind === 'video'
                    ? t('Sí, quitarlo', 'Yes, remove it')
                    : t('Sí, quitarla', 'Yes, remove it')}
                </Button>
                <Button
                  variant="ghost"
                  disabled={remove.isPending}
                  onClick={() => {
                    setConfirmingRemoval(false);
                  }}
                >
                  {t('Cancelar', 'Cancel')}
                </Button>
              </div>
            }
          >
            {t(
              'Se borra del todo. No se puede deshacer.',
              'It’s deleted for good. This can’t be undone.',
            )}
          </Notice>
        ) : (
          (canChoose || media !== null) && (
            <div className={styles.actions}>
              {codec !== null && (
                <Button
                  variant="secondary"
                  loading={
                    preparing?.kind === 'photo' || (upload.isPending && uploadingKind === 'photo')
                  }
                  disabled={busy}
                  onClick={() => {
                    photoInputRef.current?.click();
                  }}
                >
                  {media?.kind === 'photo'
                    ? t('Cambiar foto', 'Change photo')
                    : t('Añadir foto', 'Add photo')}
                </Button>
              )}
              {converter !== null && (
                <Button
                  variant="secondary"
                  loading={
                    preparing?.kind === 'video' || (upload.isPending && uploadingKind === 'video')
                  }
                  disabled={busy}
                  onClick={() => {
                    videoInputRef.current?.click();
                  }}
                >
                  {media?.kind === 'video'
                    ? t('Cambiar vídeo', 'Change video')
                    : t('Añadir vídeo', 'Add video')}
                </Button>
              )}
              {media !== null && canChoose && (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setConfirmingRemoval(true);
                  }}
                >
                  {media.kind === 'video'
                    ? t('Quitar vídeo', 'Remove video')
                    : t('Quitar foto', 'Remove photo')}
                </Button>
              )}
            </div>
          )
        )}
      </div>
    </Surface>
  );
}

interface ExerciseMediaFileProps {
  readonly exerciseId: ResourceId;
  readonly mediaId: string;
  readonly name: string;
}

/**
 * Engancha el fichero descargado a una imagen o un vídeo con una dirección `blob:`, creada al montar
 * el elemento y liberada al quitarlo (limpieza del ref de React 19): sin liberarla, cada medio visto
 * se quedaría en memoria hasta cerrar la app. En un ref y no en un efecto con estado porque
 * `StrictMode` monta dos veces y la dirección no sobreviviría.
 */
function useBlobSource<Element extends HTMLImageElement | HTMLVideoElement>(
  blob: Blob | undefined,
): (element: Element | null) => (() => void) | undefined {
  return useCallback(
    (element: Element | null) => {
      if (element === null || blob === undefined) return undefined;
      const url = URL.createObjectURL(blob);
      element.src = url;

      return () => {
        URL.revokeObjectURL(url);
      };
    },
    [blob],
  );
}

/** La foto descargada con la sesión. Ocupa su sitio mientras baja para que la ficha no salte. */
function ExercisePhoto({ exerciseId, mediaId, name }: ExerciseMediaFileProps) {
  const file = useExerciseMediaFile(exerciseId, mediaId);
  const attachPhoto = useBlobSource<HTMLImageElement>(file.data);

  if (file.isError) {
    return (
      <Notice title={t('La foto no se pudo cargar', 'The photo couldn’t load')}>
        {describeError(file.error)}
      </Notice>
    );
  }

  return (
    <figure className={styles.frame}>
      {file.data === undefined ? (
        <span className={styles.placeholder}>
          <Spinner label={t('Cargando foto', 'Loading photo')} />
        </span>
      ) : (
        <img
          ref={attachPhoto}
          alt={t(`Foto de la técnica de ${name}`, `Technique photo for ${name}`)}
          className={styles.image}
        />
      )}
    </figure>
  );
}

/**
 * El vídeo, bajado entero con la sesión: un `<video>` no manda la cabecera `Authorization`, así que
 * no puede pedir el fichero por trozos al Worker. Sin sonido (se subió sin él) y dentro de la página,
 * para que el iPhone no lo abra a pantalla completa.
 */
function ExerciseVideo({ exerciseId, mediaId, name }: ExerciseMediaFileProps) {
  const file = useExerciseMediaFile(exerciseId, mediaId);
  const attachVideo = useBlobSource<HTMLVideoElement>(file.data);

  if (file.isError) {
    return (
      <Notice title={t('El vídeo no se pudo cargar', 'The video couldn’t load')}>
        {describeError(file.error)}
      </Notice>
    );
  }

  return (
    <figure className={styles.frame}>
      {file.data === undefined ? (
        <span className={styles.placeholder}>
          <Spinner label={t('Cargando vídeo', 'Loading video')} />
        </span>
      ) : (
        <video
          ref={attachVideo}
          aria-label={t(`Vídeo de la técnica de ${name}`, `Technique video for ${name}`)}
          className={styles.image}
          controls
          muted
          playsInline
          loop
        />
      )}
    </figure>
  );
}

function describeVideoProgress(progress: number | null): string {
  if (progress === null) return t('Leyendo el vídeo…', 'Reading the video…');
  const percent = new Intl.NumberFormat(intlLocale(), {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(progress);
  return t(`Convirtiendo el vídeo… ${percent}`, `Converting the video… ${percent}`);
}

function describePhotoError(error: unknown): string {
  if (error instanceof PhotoCompressionError) {
    return error.reason === 'too_large'
      ? t(
          'Incluso reducida, la foto pesa demasiado. Prueba con otra.',
          'Even reduced, the photo is too large. Try another one.',
        )
      : t(
          'El móvil no pudo leer esa foto. Prueba con otra o hazla de nuevo.',
          'Your phone couldn’t read that photo. Try another or take it again.',
        );
  }

  return describeError(error);
}

function describeVideoError(error: unknown): string {
  if (!(error instanceof VideoConversionError)) return describeError(error);

  switch (error.reason) {
    case 'too_long':
      return t(
        'El vídeo pasa del minuto. Recórtalo en Fotos o elige uno más corto.',
        'The video is over a minute. Trim it in Photos or choose a shorter one.',
      );
    case 'too_large':
      return t(
        'Incluso convertido, el vídeo pesa demasiado. Recórtalo y prueba otra vez.',
        'Even converted, the video is too large. Trim it and try again.',
      );
    case 'no_video':
      return t('Ese fichero no lleva vídeo.', 'That file has no video.');
    case 'unreadable':
      return t(
        'El móvil no pudo leer ese vídeo. Prueba con otro.',
        'Your phone couldn’t read that video. Try another one.',
      );
    case 'failed':
      return t(
        'El móvil empezó a convertir el vídeo pero no pudo terminar. Prueba otra vez sin salir de la app.',
        'Your phone started converting the video but couldn’t finish. Try again without leaving the app.',
      );
  }
}
