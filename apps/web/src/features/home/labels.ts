/**
 * Los días de la semana, de lunes a domingo, que es el orden en el que los devuelve el
 * contrato. La inicial es lo único que cabe bajo cada día; el nombre completo va en el detalle del
 * día elegido y en lo que lee quien no ve la pantalla.
 */
export const WEEKDAY_INITIALS: readonly string[] = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export const WEEKDAY_NAMES: readonly string[] = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
];

/** Un día entrenado del que no se puede decir qué parte del cuerpo fue: ejercicios propios sin clasificar. */
export const UNCLASSIFIED_DAY_LABEL = 'Otro';
