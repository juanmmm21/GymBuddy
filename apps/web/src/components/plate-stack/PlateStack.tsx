import {
  barbellLoad,
  formatGramsAsKilograms,
  parseKilogramsToGrams,
  type Locale,
  type PlateGrams,
  type WeightKilograms,
} from '@gymbuddy/shared';
import { cx } from '../../lib/cx';
import { formatWeightLabel } from '../../lib/format';
import styles from './PlateStack.module.css';

export interface PlateStackProps {
  /** El peso total de la serie, barra incluida, como lo trae el contrato. */
  readonly weight: WeightKilograms;
  readonly locale: Locale;
  readonly className?: string;
}

/**
 * Un lado de la barra con sus discos, del tope hacia fuera. No se pinta nada si el peso no llega a
 * la barra: una serie de 15 kg no es una barra cargada. Lo que no se puede cargar exacto con los
 * discos de un gimnasio se escribe al lado, en vez de dibujar un peso que no es.
 */
export function PlateStack({ weight, locale, className }: PlateStackProps) {
  const load = loadOf(weight);
  if (load === null) return null;

  return (
    <span
      className={cx(styles.stack, className)}
      role="img"
      aria-label={describeLoad(load, locale)}
    >
      <span className={styles.bar} aria-hidden="true" />
      {load.perSide.map((plate, index) => (
        // El orden es el de la barra y dos discos iguales son intercambiables: el índice basta.
        <span key={index} className={cx(styles.plate, PLATE_CLASS[plate])} aria-hidden="true" />
      ))}
      <span className={styles.sleeve} aria-hidden="true" />
      {load.remainderGrams > 0 && (
        <span className={styles.remainder} aria-hidden="true">
          +{formatWeightLabel(formatGramsAsKilograms(load.remainderGrams), locale)}
        </span>
      )}
    </span>
  );
}

const PLATE_CLASS: Readonly<Record<PlateGrams, string | undefined>> = {
  25_000: styles.plate25,
  20_000: styles.plate20,
  15_000: styles.plate15,
  10_000: styles.plate10,
  5_000: styles.plate5,
  2_500: styles.plate2p5,
  1_250: styles.plate1p25,
};

function loadOf(weight: WeightKilograms): ReturnType<typeof barbellLoad> {
  try {
    return barbellLoad(parseKilogramsToGrams(weight));
  } catch (error) {
    // El contrato ya valida el peso; si aun así no se lee, se deja la serie sin dibujo.
    console.warn('No se pudo leer el peso para dibujar los discos', weight, error);
    return null;
  }
}

/** Lo que dice un lector de pantalla: los discos de un lado y, si lo hay, lo que no cuadra. */
export function describeLoad(
  load: NonNullable<ReturnType<typeof barbellLoad>>,
  locale: Locale,
): string {
  const plates = load.perSide.map((plate) =>
    formatWeightLabel(formatGramsAsKilograms(plate), locale),
  );
  const base = plates.length === 0 ? 'Barra sola, sin discos' : `Por lado: ${joinSpanish(plates)}`;

  return load.remainderGrams > 0
    ? `${base}; faltan ${formatWeightLabel(formatGramsAsKilograms(load.remainderGrams), locale)} que no se pueden cargar con discos`
    : base;
}

function joinSpanish(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1] ?? ''}`;
}
