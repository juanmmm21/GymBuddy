import type { BodyPart, BodyPartLoadLevel, WeeklyCalendarBodyPart } from '@gymbuddy/shared';
import type { ReactNode } from 'react';
import styles from './BodyMap.module.css';
import { bodyMapLevels } from './body-map';

export interface BodyMapProps {
  /** Lo que trabajó cada parte ese día. Vacío es un día sin nada clasificable: el cuerpo en reposo. */
  readonly loads: readonly WeeklyCalendarBodyPart[];
  readonly className?: string | undefined;
}

/**
 * Un cuerpo de frente con cada zona entrenada encendida, más oscura cuanto más series tuvo (opción
 * B que eligió Juan el 2026-09-16). La espalda son los dorsales que asoman a los lados del tronco:
 * así pecho, espalda y core se encienden a la vez sin darle la vuelta al cuerpo. El cardio no tiene
 * zona y sale como un corazón en la esquina. Es decoración del botón del día, que lleva el nombre
 * en su texto accesible, así que se oculta a los lectores de pantalla.
 */
export function BodyMap({ loads, className }: BodyMapProps) {
  const levels = bodyMapLevels(loads);

  return (
    <svg className={className} viewBox="0 0 32 44" aria-hidden="true">
      <circle className={styles.rest} cx="16" cy="4.6" r="3.4" />
      {ZONES.map((zone) => (
        <g
          key={zone}
          className={zoneClass(levels[zone])}
          data-zone={zone}
          data-level={levels[zone] ?? 0}
        >
          {ZONE_SHAPES[zone]}
        </g>
      ))}
      {levels.cardio !== null && (
        <path
          className={zoneClass(levels.cardio)}
          data-zone="cardio"
          data-level={levels.cardio}
          d="M27.5 8.2s-3.6-2.3-4.3-4.5c-.5-1.7.7-3.2 2.2-2.9.9.2 1.6.8 2.1 1.6.5-.8 1.2-1.4 2.1-1.6 1.5-.3 2.7 1.2 2.2 2.9-.7 2.2-4.3 4.5-4.3 4.5z"
        />
      )}
    </svg>
  );
}

type Zone = Exclude<BodyPart, 'cardio'>;

/** De arriba abajo, en el orden del dibujo. */
const ZONES: readonly Zone[] = ['shoulders', 'chest', 'back', 'core', 'arms', 'legs'];

// Las piezas no se tocan entre sí: con un hueco de aire cada zona se lee sola aunque dos vecinas
// tengan el mismo nivel.
const ZONE_SHAPES: Readonly<Record<Zone, ReactNode>> = {
  shoulders: (
    <>
      <ellipse cx="8.2" cy="11.2" rx="2.6" ry="2.3" />
      <ellipse cx="23.8" cy="11.2" rx="2.6" ry="2.3" />
    </>
  ),
  chest: <path d="M12.2 9.6h7.6v5c-1.3.9-2.5 1.1-3.8.5-1.3.6-2.5.4-3.8-.5z" />,
  back: (
    <>
      <path d="M11.4 12v12.4l-1.2-.2L9.1 16z" />
      <path d="M20.6 12v12.4l1.2-.2L22.9 16z" />
    </>
  ),
  core: <rect x="12.4" y="16.4" width="7.2" height="8.2" rx="1.4" />,
  arms: (
    <>
      <rect x="4.4" y="14.6" width="3.2" height="13.4" rx="1.6" />
      <rect x="24.4" y="14.6" width="3.2" height="13.4" rx="1.6" />
    </>
  ),
  legs: (
    <>
      <rect x="11.4" y="26" width="4.2" height="17" rx="2" />
      <rect x="16.4" y="26" width="4.2" height="17" rx="2" />
    </>
  ),
};

function zoneClass(level: BodyPartLoadLevel | null): string | undefined {
  return level === null ? styles.rest : LEVEL_CLASSES[level];
}

const LEVEL_CLASSES: Readonly<Record<BodyPartLoadLevel, string | undefined>> = {
  1: styles.level1,
  2: styles.level2,
  3: styles.level3,
  4: styles.level4,
};
