import { useState } from 'react';

/**
 * El último valor que hubo, para lo que sigue en pantalla después de dejar de hacer falta. Una hoja
 * que se abre con un dato —la serie que se corrige, la línea que se ajusta— lo pierde en cuanto se
 * pide cerrarla, y sin esto bajaría en blanco durante lo que dure la animación de salida.
 *
 * El valor tiene que ser estable entre renders (un estado, no un objeto recién construido), o cada
 * render pediría otro.
 */
export function useLastPresent<T>(value: T | null): T | null {
  const [last, setLast] = useState(value);
  if (value !== null && value !== last) setLast(value);
  return value ?? last;
}
