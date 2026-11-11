import type { Locale, MascotMood } from '@gymbuddy/shared';
import { currentLocale } from '../../i18n/index';

/**
 * Cómo se describe el dibujo a quien no lo ve. La mascota sigue sin nombre (lo decide
 * Juan), así que se la llama por lo que es.
 */
const MASCOT_MOOD_LABELS: Readonly<Record<Locale, Readonly<Record<MascotMood, string>>>> = {
  es: {
    idle: 'Tu compañero, tranquilo',
    resting: 'Tu compañero, recuperando el aliento',
    cheering: 'Tu compañero, animándote',
    celebrating: 'Tu compañero, celebrando',
    nudging: 'Tu compañero, saludándote',
    sleepy: 'Tu compañero, dormido',
  },
  en: {
    idle: 'Your buddy, relaxed',
    resting: 'Your buddy, catching its breath',
    cheering: 'Your buddy, cheering you on',
    celebrating: 'Your buddy, celebrating',
    nudging: 'Your buddy, waving at you',
    sleepy: 'Your buddy, asleep',
  },
};

export function mascotMoodLabel(mood: MascotMood): string {
  return MASCOT_MOOD_LABELS[currentLocale()][mood];
}
