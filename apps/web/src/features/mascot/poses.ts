import type { MascotMood } from '@gymbuddy/shared';

/**
 * El dibujo de la mascota: un muñeco de trazo simple, sin rellenos. Todo son trazados en
 * unidades del `viewBox` —no píxeles—, así que el muñeco escala con la tarjeta y el grosor
 * del trazo lo pone la hoja de estilos desde los tokens. Lo que no cambia entre estados
 * (cabeza, cinta del pelo y tronco) se dibuja siempre igual; cada pose cambia solo la
 * postura y la cara, que es lo que hace que se reconozca el mismo personaje.
 */

export const MASCOT_VIEWBOX = { width: 120, height: 140 } as const;

export const MASCOT_HEAD = { cx: 60, cy: 38, r: 20 } as const;

/** Donde gira la cabeza cuando se inclina: la base del cuello. */
export const MASCOT_NECK = { x: 60, y: 58 } as const;

export const MASCOT_TORSO = 'M 60 58 L 60 96';

/** La cinta del pelo, con el nudo por fuera: lo que lo hace un muñeco de gimnasio. */
export const MASCOT_HEADBAND = [
  'M 41.7 30 Q 60 35 78.3 30',
  'M 78.3 30 L 87 25',
  'M 78.3 30 L 88 33',
];

/** El tono de un adorno. Sale de la paleta de tokens como el resto del trazo. */
export type MascotAccentTone = 'accent' | 'success' | 'muted';

export interface MascotAccent {
  readonly d: string;
  readonly tone: MascotAccentTone;
}

export interface MascotPose {
  /** Brazos y piernas quietos respecto al cuerpo. */
  readonly limbs: readonly string[];
  /** El brazo que saluda: va aparte porque es lo único que se anima suelto, girando sobre el hombro. */
  readonly wavingArm: string | null;
  /** Ojos y boca, que giran con la cabeza. */
  readonly face: readonly string[];
  /** Grados de inclinación de la cabeza sobre el cuello; positivo hacia la derecha. */
  readonly headTilt: number;
  /** Lo que va alrededor del muñeco: confeti, zetas, resoplidos. */
  readonly accents: readonly MascotAccent[];
}

const STANDING_LEGS = ['M 60 96 L 49 125 L 43 125', 'M 60 96 L 71 125 L 77 125'];
const HANDS_ON_HIPS = ['M 60 66 L 46 78 L 55 88', 'M 60 66 L 74 78 L 65 88'];

const OPEN_LEFT_EYE = 'M 53 36 L 53 39';
const OPEN_RIGHT_EYE = 'M 67 36 L 67 39';
const CLOSED_LEFT_EYE = 'M 50 37 Q 53 40 56 37';
const CLOSED_RIGHT_EYE = 'M 64 37 Q 67 40 70 37';
const OPEN_EYES = [OPEN_LEFT_EYE, OPEN_RIGHT_EYE];
const HAPPY_EYES = ['M 50 37 Q 53 33 56 37', 'M 64 37 Q 67 33 70 37'];
const CLOSED_EYES = [CLOSED_LEFT_EYE, CLOSED_RIGHT_EYE];
const SMILE = 'M 52 45 Q 60 51 68 45';
/** Boca abierta de alegría: cerrada con `Z` pero sin relleno, es solo su contorno. */
const BIG_SMILE = 'M 51 44 Q 60 55 69 44 Z';

export const MASCOT_POSES: Readonly<Record<MascotMood, MascotPose>> = {
  idle: {
    limbs: ['M 60 66 Q 49 76 45 90', 'M 60 66 Q 71 76 75 90', ...STANDING_LEGS],
    wavingArm: null,
    face: [...OPEN_EYES, SMILE],
    headTilt: 0,
    accents: [],
  },
  // Manos en las caderas y ojos cerrados: recuperando el aliento, no aburrido.
  resting: {
    limbs: [...HANDS_ON_HIPS, ...STANDING_LEGS],
    wavingArm: null,
    face: [...CLOSED_EYES, 'M 57.5 46 A 2.5 2.5 0 1 0 62.5 46 A 2.5 2.5 0 1 0 57.5 46'],
    headTilt: 0,
    accents: [
      { d: 'M 84 42 Q 88 39 92 42', tone: 'muted' },
      { d: 'M 86 50 Q 90 47 94 50', tone: 'muted' },
    ],
  },
  cheering: {
    limbs: ['M 60 66 Q 49 58 42 44', 'M 60 66 Q 71 58 78 44', ...STANDING_LEGS],
    wavingArm: null,
    face: [...HAPPY_EYES, BIG_SMILE],
    headTilt: 0,
    accents: [],
  },
  // En el aire: brazos arriba y piernas recogidas, con confeti de los dos tonos alegres.
  celebrating: {
    limbs: [
      'M 60 66 Q 47 56 40 40',
      'M 60 66 Q 73 56 80 40',
      'M 60 96 Q 46 102 48 116 L 42 118',
      'M 60 96 Q 74 102 72 116 L 78 118',
    ],
    wavingArm: null,
    face: [...HAPPY_EYES, BIG_SMILE],
    headTilt: 0,
    accents: [
      { d: 'M 20 30 L 26 25', tone: 'accent' },
      { d: 'M 98 22 L 103 28', tone: 'accent' },
      { d: 'M 14 62 L 18 68', tone: 'accent' },
      { d: 'M 104 60 L 99 66', tone: 'success' },
      { d: 'M 30 10 L 33 16', tone: 'success' },
      { d: 'M 90 8 L 86 14', tone: 'success' },
    ],
  },
  // Saluda con un guiño: llama la atención sin cara de reproche.
  nudging: {
    limbs: ['M 60 66 L 46 78 L 55 88', ...STANDING_LEGS],
    wavingArm: 'M 60 66 Q 76 62 82 46',
    face: [CLOSED_LEFT_EYE, OPEN_RIGHT_EYE, 'M 52 45 Q 61 51 69 43'],
    headTilt: 0,
    accents: [{ d: 'M 89 38 Q 93 42 89 47', tone: 'accent' }],
  },
  // Cabeza caída, ojos en raya y zetas: dormido esperando, con una sonrisa.
  sleepy: {
    limbs: ['M 60 66 Q 50 78 48 92', 'M 60 66 Q 70 78 72 92', ...STANDING_LEGS],
    wavingArm: null,
    face: ['M 50 38 L 56 38', 'M 64 38 L 70 38', 'M 56 46 Q 60 48 64 46'],
    headTilt: 12,
    accents: [
      { d: 'M 86 22 L 94 22 L 86 30 L 94 30', tone: 'muted' },
      { d: 'M 98 8 L 103 8 L 98 13 L 103 13', tone: 'muted' },
    ],
  },
};
