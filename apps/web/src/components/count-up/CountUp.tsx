import { useCountUp } from '../../hooks/use-count-up';

export interface CountUpProps {
  /** La cifra de verdad: el número al que llega la cuenta. */
  readonly value: number;
  /** Cómo se lee esa cifra («3 semanas»). Se aplica también a los números por los que pasa. */
  readonly format: (value: number) => string;
  readonly className?: string | undefined;
}

/**
 * Una cifra que sube hasta su valor al aparecer en pantalla.
 *
 * Mientras cuenta se oculta a los lectores de pantalla y solo entra en el árbol accesible cuando
 * llega: un número que cambia veinte veces en un tercio de segundo no es información, es ruido.
 * Quien pide menos movimiento no ve ninguna cuenta y por tanto no pierde nada de vista.
 */
export function CountUp({ value, format, className }: CountUpProps) {
  const shown = useCountUp(value);
  const counting = shown !== value;

  return (
    <span
      className={className}
      aria-hidden={counting || undefined}
      data-counting={counting ? 'true' : undefined}
    >
      {format(shown)}
    </span>
  );
}
