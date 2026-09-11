import type { MascotMood } from '@gymbuddy/shared';

/**
 * Cómo se describe el dibujo a quien no lo ve. La mascota sigue sin nombre (lo decide
 * Juan), así que se la llama por lo que es.
 */
export const MASCOT_MOOD_LABELS: Readonly<Record<MascotMood, string>> = {
  idle: 'Tu compañero, tranquilo',
  resting: 'Tu compañero, recuperando el aliento',
  cheering: 'Tu compañero, animándote',
  celebrating: 'Tu compañero, celebrando',
  nudging: 'Tu compañero, saludándote',
  sleepy: 'Tu compañero, dormido',
};
