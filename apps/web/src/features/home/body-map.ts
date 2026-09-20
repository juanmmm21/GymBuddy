import {
  bodyPartLoadLevel,
  type BodyPart,
  type BodyPartLoadLevel,
  type WeeklyCalendarBodyPart,
} from '@gymbuddy/shared';
import { pluralize } from '../../lib/format';
import { BODY_PART_LABELS } from '../catalog/labels';

/** Cada parte del cuerpo con su nivel del día, o `null` si no se tocó. */
export type BodyMapLevels = Readonly<Record<BodyPart, BodyPartLoadLevel | null>>;

/** Las zonas que tienen sitio en la silueta, de arriba abajo: el orden en que se dibujan. */
export type BodyMapZone = Exclude<BodyPart, 'cardio'>;

export const BODY_MAP_ZONES: readonly BodyMapZone[] = [
  'shoulders',
  'chest',
  'back',
  'core',
  'arms',
  'legs',
];

/**
 * El orden en que se encienden al entrar: el mismo del dibujo, con el cardio al final porque no
 * es una zona del cuerpo sino el corazón de la esquina.
 */
const ENTRANCE_ORDER: readonly BodyPart[] = [...BODY_MAP_ZONES, 'cardio'];

/**
 * En qué turno se enciende esa zona, o `null` si ese día no se trabajó (las apagadas ya están
 * puestas: lo que entra es la luz, no el cuerpo).
 *
 * El turno se cuenta **entre las encendidas**, no por la posición anatómica: un día de solo
 * piernas empieza a encenderse en el acto en vez de esperar a que pasen de largo cinco zonas
 * que no se van a encender.
 */
export function bodyMapEntranceStep(levels: BodyMapLevels, zone: BodyPart): number | null {
  if (levels[zone] === null) return null;

  let step = 0;
  for (const candidate of ENTRANCE_ORDER) {
    if (candidate === zone) return step;
    if (levels[candidate] !== null) step += 1;
  }

  return null;
}

/**
 * Lo que enciende la silueta de un día. Una parte repetida se queda con su nivel más alto: la
 * zona es una sola y no puede pintarse dos veces.
 */
export function bodyMapLevels(loads: readonly WeeklyCalendarBodyPart[]): BodyMapLevels {
  const levels: Record<BodyPart, BodyPartLoadLevel | null> = {
    arms: null,
    back: null,
    cardio: null,
    chest: null,
    core: null,
    legs: null,
    shoulders: null,
  };

  for (const load of loads) {
    const level = bodyPartLoadLevel(load.setCount);
    const current = levels[load.bodyPart];
    if (level !== null && (current === null || level > current)) {
      levels[load.bodyPart] = level;
    }
  }

  return levels;
}

/** «Pecho y Brazos», en el orden en que llegan: de la parte con más series a la de menos. */
export function bodyPartNames(loads: readonly WeeklyCalendarBodyPart[]): string {
  const names = loads.map((load) => BODY_PART_LABELS[load.bodyPart]);
  const last = names.pop();
  if (last === undefined) return '';

  return names.length === 0 ? last : `${names.join(', ')} y ${last}`;
}

/** «Pecho 8 series, Brazos 2 series»: cuánto fue cada parte, que es lo que la silueta oscurece. */
export function bodyPartBreakdown(loads: readonly WeeklyCalendarBodyPart[]): string {
  return loads
    .map(
      (load) => `${BODY_PART_LABELS[load.bodyPart]} ${pluralize(load.setCount, 'serie', 'series')}`,
    )
    .join(', ');
}
