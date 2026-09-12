import { formatAccessCode } from '@gymbuddy/shared';
import type { ReactNode } from 'react';
import { Surface } from '../surface/Surface';
import styles from './AccessCode.module.css';

export interface AccessCodeProps {
  /** El código en su forma canónica; aquí se agrupa de cuatro en cuatro para leerlo. */
  readonly code: string;
  /** El pie: lo que le queda de vida, o hasta cuándo vale. */
  readonly children: ReactNode;
}

/**
 * Un código de acceso en grande con su pie. Lo comparten «añadir otro dispositivo» e «invitar
 * a un amigo»: los dos enseñan un código que se lee desde otro móvil o se copia a un mensaje,
 * y tienen que verse igual porque son la misma cosa para quien los usa.
 */
export function AccessCode({ code, children }: AccessCodeProps) {
  return (
    <Surface as="section" padding="lg" className={styles.panel}>
      <p className={styles.value}>{formatAccessCode(code)}</p>
      {children}
    </Surface>
  );
}
