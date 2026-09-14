import type { MascotState } from '@gymbuddy/shared';
import type { MascotLayout } from './Mascot';

/**
 * Los sitios donde puede salir la mascota. Juan la quiso «menos cartel y más momento» (opción A,
 * 2026-09-14): en Hoy solo cuando tiene algo que decir, en la sesión para empezar y para los récords,
 * y dentro del descanso mientras se descansa.
 */
export type MascotSpot = 'home' | 'session' | 'rest';

/**
 * Si la mascota sale en ese sitio con ese estado. Es la otra mitad de la lógica de la mascota: qué
 * cara pone lo decide `mascotState`, y dónde se deja ver, esto. Ninguna pantalla lo decide con un
 * `if` propio, así que las tres coinciden siempre.
 */
export function mascotAppearsIn(state: MascotState, spot: MascotSpot): boolean {
  switch (spot) {
    case 'home':
      // Un consejo, un aviso de ausencia, que se ha dormido o una marca de hace un momento.
      return state.mood === 'nudging' || state.mood === 'sleepy' || state.mood === 'celebrating';
    case 'session':
      return (
        state.mood === 'celebrating' ||
        (state.mood === 'cheering' && state.reason === 'session_started')
      );
    case 'rest':
      return (
        state.mood === 'resting' || (state.mood === 'cheering' && state.reason === 'rest_over')
      );
  }
}

/** La forma con la que sale: un récord es siempre el aviso rojo; en el descanso va integrada. */
export function mascotLayoutIn(state: MascotState, spot: MascotSpot): MascotLayout {
  if (state.mood === 'celebrating') return 'toast';
  return spot === 'rest' ? 'inline' : 'tip';
}
