import { Surface } from '../surface/Surface';
import { Skeleton } from './Skeleton';
import styles from './SkeletonList.module.css';

export interface SkeletonListProps {
  /** Cuántas filas se dibujan; las justas para llenar la pantalla sin prometer más de las que hay. */
  readonly rows?: number;
  /** Con el cuadrado de la miniatura a la izquierda: las filas del catálogo lo llevan. */
  readonly thumb?: boolean;
  /** Lo que se está esperando, para el lector de pantalla. */
  readonly label?: string;
}

/**
 * Las filas de una lista que todavía se está cargando, con la forma que van a tener. Sustituye al
 * spinner suelto en el centro: la pantalla se queda quieta en vez de saltar de un símbolo girando
 * a una lista entera, y en el gimnasio se ve de un vistazo que eso viene, no que se ha roto.
 *
 * Anuncia la espera una sola vez, en el contenedor; los huecos de dentro son decorativos.
 */
export function SkeletonList({ rows = 4, thumb = false, label = 'Cargando' }: SkeletonListProps) {
  const count = Math.max(Math.trunc(rows), 1);

  return (
    <div className={styles.list} role="status" aria-label={label}>
      {Array.from({ length: count }, (_, index) => (
        <Surface key={index} padding="none" className={styles.row}>
          {thumb && <Skeleton shape="thumb" />}
          <span className={styles.text}>
            <Skeleton shape="title" />
            <Skeleton shape="lineShort" />
          </span>
          <Skeleton shape="badge" />
        </Surface>
      ))}
    </div>
  );
}
