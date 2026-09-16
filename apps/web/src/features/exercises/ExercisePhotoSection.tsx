import type { ResourceId, TrackedExercise } from '@gymbuddy/shared';
import { useCallback, useRef, useState, type ChangeEvent } from 'react';
import { useRemoveExerciseMedia, useUploadExercisePhoto } from '../../api/mutations';
import { useExerciseMediaFile } from '../../api/queries';
import { Button, Notice, Spinner, Surface } from '../../components/index';
import { describeError } from '../../lib/errors';
import styles from './ExercisePhotoSection.module.css';
import { compressPhoto, PhotoCompressionError } from './photo-compression';
import { usePhotoCodec } from './PhotoCodecProvider';

export interface ExercisePhotoSectionProps {
  readonly exercise: TrackedExercise;
}

/**
 * La foto de la técnica de un ejercicio propio: los del catálogo ya traen su animación. La foto se
 * re-codifica en el móvil antes de subirla (una del iPhone pesa varios MB) y va directa al Worker,
 * fuera de la cola offline: sin red se dice, no se guarda para luego.
 */
export function ExercisePhotoSection({ exercise }: ExercisePhotoSectionProps) {
  const codec = usePhotoCodec();
  const upload = useUploadExercisePhoto();
  const remove = useRemoveExerciseMedia();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);

  const media = exercise.media;
  const busy = preparing || upload.isPending || remove.isPending;

  const handleFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    // Se vacía ya: elegir otra vez la misma foto tras un fallo tiene que volver a disparar el cambio.
    event.target.value = '';
    if (file === undefined || codec === null) return;

    setPrepareError(null);
    upload.reset();
    remove.reset();
    setPreparing(true);
    try {
      const photo = await compressPhoto(file, codec);
      upload.mutate({ exerciseId: exercise.id, photo });
    } catch (error) {
      console.error('No se pudo preparar la foto', error);
      setPrepareError(describePhotoError(error));
    } finally {
      setPreparing(false);
    }
  };

  const error = prepareError ?? (upload.isError ? describeError(upload.error) : null);

  return (
    <Surface as="section" aria-label="Foto de la técnica">
      <h2 className={styles.title}>Técnica</h2>

      <div className={styles.stack}>
        {media === null ? (
          <p className={styles.hint}>Pon una foto de cómo se hace para acordarte la próxima vez.</p>
        ) : (
          <ExercisePhoto exerciseId={exercise.id} mediaId={media.id} name={exercise.name} />
        )}

        {preparing && (
          <p className={styles.status} role="status">
            Preparando la foto…
          </p>
        )}

        {error !== null && (
          <Notice tone="danger" title="No se pudo guardar la foto">
            {error}
          </Notice>
        )}
        {remove.isError && (
          <Notice tone="danger" title="No se pudo quitar la foto">
            {describeError(remove.error)}
          </Notice>
        )}

        {codec === null ? (
          <p className={styles.hint}>Este navegador no puede preparar fotos para subirlas.</p>
        ) : (
          <>
            <input
              ref={inputRef}
              type="file"
              // Con `image/*` Safari de iOS ofrece la cámara y la fototeca, y entrega el HEIC ya en JPEG.
              accept="image/*"
              className={styles.fileInput}
              aria-label="Elegir foto de la técnica"
              tabIndex={-1}
              onChange={(event) => {
                void handleFile(event);
              }}
            />
            {confirmingRemoval && media !== null ? (
              <Notice
                tone="warning"
                title="¿Quitar la foto?"
                action={
                  <div className={styles.actions}>
                    <Button
                      variant="danger"
                      loading={remove.isPending}
                      onClick={() => {
                        upload.reset();
                        remove.mutate(exercise.id, {
                          onSuccess: () => {
                            setConfirmingRemoval(false);
                          },
                        });
                      }}
                    >
                      Sí, quitarla
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={remove.isPending}
                      onClick={() => {
                        setConfirmingRemoval(false);
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                }
              >
                Se borra del todo. No se puede deshacer.
              </Notice>
            ) : (
              <div className={styles.actions}>
                <Button
                  variant="secondary"
                  loading={preparing || upload.isPending}
                  disabled={busy}
                  onClick={() => {
                    inputRef.current?.click();
                  }}
                >
                  {media === null ? 'Añadir foto' : 'Cambiar foto'}
                </Button>
                {media !== null && (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      setConfirmingRemoval(true);
                    }}
                  >
                    Quitar foto
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Surface>
  );
}

interface ExercisePhotoProps {
  readonly exerciseId: ResourceId;
  readonly mediaId: string;
  readonly name: string;
}

/** La foto descargada con la sesión. Ocupa su sitio mientras baja para que la ficha no salte. */
function ExercisePhoto({ exerciseId, mediaId, name }: ExercisePhotoProps) {
  const file = useExerciseMediaFile(exerciseId, mediaId);
  const blob = file.data;

  /*
   * La dirección `blob:` se crea al montar la imagen y se libera al quitarla (limpieza del ref de
   * React 19): sin liberarla, cada foto vista se quedaría en memoria hasta cerrar la app. En un ref y
   * no en un efecto con estado porque `StrictMode` monta dos veces y la dirección no sobreviviría.
   */
  const attachPhoto = useCallback(
    (image: HTMLImageElement | null) => {
      if (image === null || blob === undefined) return undefined;
      const url = URL.createObjectURL(blob);
      image.src = url;

      return () => {
        URL.revokeObjectURL(url);
      };
    },
    [blob],
  );

  if (file.isError) {
    return <Notice title="La foto no se pudo cargar">{describeError(file.error)}</Notice>;
  }

  return (
    <figure className={styles.frame}>
      {blob === undefined ? (
        <span className={styles.placeholder}>
          <Spinner label="Cargando foto" />
        </span>
      ) : (
        <img ref={attachPhoto} alt={`Foto de la técnica de ${name}`} className={styles.image} />
      )}
    </figure>
  );
}

function describePhotoError(error: unknown): string {
  if (error instanceof PhotoCompressionError) {
    return error.reason === 'too_large'
      ? 'Incluso reducida, la foto pesa demasiado. Prueba con otra.'
      : 'El móvil no pudo leer esa foto. Prueba con otra o hazla de nuevo.';
  }

  return describeError(error);
}
