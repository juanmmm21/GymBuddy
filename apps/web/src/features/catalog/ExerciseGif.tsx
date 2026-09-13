import { useState } from 'react';
import { Notice, Spinner } from '../../components/index';
import { cx } from '../../lib/cx';
import styles from './ExerciseGif.module.css';

export interface ExerciseGifProps {
  readonly src: string;
  readonly alt: string;
}

type LoadState = 'loading' | 'loaded' | 'failed';

/**
 * La animación del ejercicio, servida por el CDN del catálogo. Mientras baja ocupa ya su
 * sitio (los GIFs son cuadrados) para que la ficha no salte al llegar, y si no llega se
 * dice: en el gimnasio sin cobertura, un hueco gris no explica nada.
 *
 * Una animación ya vista sale de la caché del service worker aunque no haya red.
 *
 * Quien lo monta debe darle `key={src}`: el estado de carga es por imagen.
 */
export function ExerciseGif({ src, alt }: ExerciseGifProps) {
  const [state, setState] = useState<LoadState>('loading');

  if (state === 'failed') {
    return (
      <Notice title="La animación no se pudo cargar">
        Hace falta conexión para verla la primera vez. El resto de la ficha sigue disponible.
      </Notice>
    );
  }

  return (
    <figure className={styles.frame}>
      {state === 'loading' && (
        <span className={styles.placeholder}>
          <Spinner label="Cargando animación" />
        </span>
      )}
      <img
        src={src}
        alt={alt}
        // En modo CORS la respuesta no es opaca y el service worker puede guardarla sabiendo
        // que es un 200 (ver `offline/gif-cache.ts`); jsDelivr responde con el permiso.
        crossOrigin="anonymous"
        decoding="async"
        className={cx(styles.image, state === 'loaded' && styles.imageVisible)}
        onLoad={() => {
          setState('loaded');
        }}
        onError={() => {
          setState('failed');
        }}
      />
    </figure>
  );
}
