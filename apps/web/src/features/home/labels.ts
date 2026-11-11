import type { Locale } from '@gymbuddy/shared';
import { currentLocale, t } from '../../i18n/index';

/**
 * Los días de la semana, de lunes a domingo, que es el orden en el que los devuelve el
 * contrato. La inicial es lo único que cabe bajo cada día; el nombre completo va en el detalle del
 * día elegido y en lo que lee quien no ve la pantalla.
 */
const WEEKDAY_INITIALS: Readonly<Record<Locale, readonly string[]>> = {
  es: ['L', 'M', 'X', 'J', 'V', 'S', 'D'],
  en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
};

const WEEKDAY_NAMES: Readonly<Record<Locale, readonly string[]>> = {
  es: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'],
  en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
};

/** La inicial de un día de la semana, empezando por el lunes (índice 0). */
export function weekdayInitial(dayIndex: number): string {
  return WEEKDAY_INITIALS[currentLocale()][dayIndex] ?? '';
}

/** El nombre de un día de la semana, empezando por el lunes (índice 0). */
export function weekdayName(dayIndex: number): string {
  return WEEKDAY_NAMES[currentLocale()][dayIndex] ?? '';
}

export function unclassifiedDayLabel(): string {
  return t('Otro', 'Other');
}
