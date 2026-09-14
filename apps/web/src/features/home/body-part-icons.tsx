import type { BodyPart } from '@gymbuddy/shared';
import type { ReactNode } from 'react';

export interface BodyPartIconProps {
  /** `null` es un día de ejercicios propios sin clasificar: se dibuja una mancuerna genérica. */
  readonly bodyPart: BodyPart | null;
  readonly className?: string | undefined;
}

/**
 * La parte del cuerpo de un día, dibujada con el mismo trazo que los iconos de las pestañas. Es
 * decoración de la etiqueta: el nombre va siempre al lado o en el texto accesible del día, así que
 * el icono se oculta a los lectores de pantalla.
 */
export function BodyPartIcon({ bodyPart, className }: BodyPartIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {bodyPart === null ? UNCLASSIFIED_PATHS : BODY_PART_PATHS[bodyPart]}
    </svg>
  );
}

const BODY_PART_PATHS: Readonly<Record<BodyPart, ReactNode>> = {
  // Un bíceps flexionado.
  arms: (
    <>
      <path d="M5 19c-1-4 0-8 3-11l2-3 3 1-1 3 2 1c3 0 5 2 5 5 0 3-3 5-7 5H7" />
      <path d="M11 13c1 1 3 1 4 0" />
    </>
  ),
  // Muslo, rodilla y gemelo.
  legs: (
    <>
      <path d="M9 3l1 7-2 5 1 6h3l-1-6 2-4-1-8" />
      <path d="M8 21h5" />
    </>
  ),
  // Los dos pectorales.
  chest: (
    <>
      <path d="M4 8c2.5-2 5.5-2 8 0 2.5-2 5.5-2 8 0v4c-2.5 3-5.5 3-8 1-2.5 2-5.5 2-8-1z" />
      <path d="M12 8v5" />
    </>
  ),
  // Columna y dorsales.
  back: (
    <>
      <path d="M12 3v18" />
      <path d="M8 6c-3 3-3 9 0 12" />
      <path d="M16 6c3 3 3 9 0 12" />
    </>
  ),
  // Los abdominales en seis bloques.
  core: (
    <>
      <rect x="7" y="4" width="10" height="16" rx="3" />
      <path d="M12 4v16M7 9.5h10M7 14.5h10" />
    </>
  ),
  // Cabeza y el arco de los hombros.
  shoulders: (
    <>
      <circle cx="12" cy="6" r="2.5" />
      <path d="M3 17c0-4 3-7 6-7h6c3 0 6 3 6 7" />
      <path d="M9 10v10M15 10v10" />
    </>
  ),
  // Un corazón con el pulso.
  cardio: (
    <>
      <path d="M12 20s-7-4.5-8.5-9C2.3 7.4 5 4 8 4.5c1.8.3 3 1.5 4 3 1-1.5 2.2-2.7 4-3 3-.5 5.7 2.9 4.5 6.5C19 15.5 12 20 12 20z" />
      <path d="M6 12h3l1.5-2.5 2 5 1.5-2.5H18" />
    </>
  ),
};

const UNCLASSIFIED_PATHS: ReactNode = (
  <>
    <path d="M6.5 8v8M17.5 8v8M4 10v4M20 10v4M6.5 12h11" />
  </>
);
