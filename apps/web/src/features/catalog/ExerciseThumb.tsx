import { useState } from 'react';
import { cx } from '../../lib/cx';
import { previewGifUrl } from './preview';
import styles from './ExerciseThumb.module.css';

export interface ExerciseThumbProps {
  readonly gifUrl: string;
}

/**
 * La animación en pequeño, en cada fila del catálogo (opción A que eligió Juan el 2026-09-14): se ve
 * cómo es el ejercicio sin entrar en él. Solo baja cuando la fila va a verse (`loading="lazy"`), y es
 * decorativa: el nombre va al lado, así que no lleva texto alternativo. Si no carga —sin red, por
 * ejemplo— se queda el hueco neutro y la fila sigue funcionando.
 *
 * Quien la monta debe darle `key={gifUrl}`: el estado de carga es por imagen.
 */
export function ExerciseThumb({ gifUrl }: ExerciseThumbProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <span className={styles.frame} aria-hidden="true">
      {!failed && (
        <img
          src={previewGifUrl(gifUrl)}
          alt=""
          loading="lazy"
          decoding="async"
          // Igual que en la ficha: sin CORS la respuesta sería opaca.
          crossOrigin="anonymous"
          className={cx(styles.image, loaded && styles.imageVisible)}
          onLoad={() => {
            setLoaded(true);
          }}
          onError={() => {
            setFailed(true);
          }}
        />
      )}
    </span>
  );
}
