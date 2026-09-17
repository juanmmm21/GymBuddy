import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '../../components/index';
import { cx } from '../../lib/cx';
import { TUTORIAL_STEPS, type TutorialIcon } from './tutorial';
import styles from './TutorialOverlay.module.css';

export interface TutorialOverlayProps {
  readonly open: boolean;
  /** Se llama tanto al saltarlo como al terminarlo: en los dos casos ya no vuelve a salir. */
  readonly onClose: () => void;
}

/**
 * Las cinco tarjetas del tutorial sobre un `<dialog>` nativo, igual que las hojas de la app: el
 * foco, la tecla Escape y el bloqueo del fondo los resuelve el navegador. El paso vuelve al primero
 * cada vez que se abre, así que verlo otra vez desde Ajustes empieza por el principio.
 */
export function TutorialOverlay({ open, onClose }: TutorialOverlayProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;

    if (open && !dialog.open) {
      setIndex(0);
      openDialog(dialog);
    } else if (!open && dialog.open) {
      closeDialog(dialog);
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;

    // Escape dispara `cancel`: se intercepta para que mande el estado de React y no se quede el
    // diálogo cerrado por su cuenta con el padre creyendo que sigue abierto.
    const handleCancel = (event: Event): void => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener('cancel', handleCancel);
    return () => {
      dialog.removeEventListener('cancel', handleCancel);
    };
  }, [onClose]);

  const step = TUTORIAL_STEPS[index];
  const isLast = index === TUTORIAL_STEPS.length - 1;

  return (
    <dialog ref={dialogRef} className={styles.dialog} aria-label="Cómo se usa GymBuddy">
      {open && step !== undefined && (
        <div className={styles.panel}>
          <header className={styles.header}>
            <p className={styles.counter}>
              Paso {index + 1} de {TUTORIAL_STEPS.length}
            </p>
            <button type="button" className={styles.skip} onClick={onClose}>
              Saltar
            </button>
          </header>
          <div className={styles.body}>
            <span className={styles.badge} aria-hidden="true">
              <StepIcon kind={step.icon} />
            </span>
            <h2 className={styles.title}>{step.title}</h2>
            <p className={styles.text}>{step.body}</p>
          </div>
          <div className={styles.dots} aria-hidden="true">
            {TUTORIAL_STEPS.map((other, position) => (
              <span
                key={other.id}
                className={cx(styles.dot, position === index && styles.dotCurrent)}
              />
            ))}
          </div>
          <footer className={styles.footer}>
            {index > 0 && (
              <Button variant="ghost" onClick={() => setIndex(index - 1)}>
                Atrás
              </Button>
            )}
            <Button
              className={styles.next}
              onClick={() => (isLast ? onClose() : setIndex(index + 1))}
            >
              {isLast ? 'Empezar' : 'Siguiente'}
            </Button>
          </footer>
        </div>
      )}
    </dialog>
  );
}

/**
 * `showModal` es lo que bloquea el fondo y atrapa el foco. Los navegadores sin él (y jsdom)
 * reciben el atributo `open` a secas: se ve, aunque sin modalidad.
 */
function openDialog(dialog: HTMLDialogElement): void {
  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }
}

function closeDialog(dialog: HTMLDialogElement): void {
  if (typeof dialog.close === 'function') {
    dialog.close();
  } else {
    dialog.removeAttribute('open');
  }
}

function StepIcon({ kind }: { readonly kind: TutorialIcon }) {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[kind]}
    </svg>
  );
}

/** Los mismos trazos que la barra de pestañas, para que cada paso se reconozca al llegar a ella. */
const ICON_PATHS: Readonly<Record<TutorialIcon, ReactNode>> = {
  home: (
    <>
      <path d="M3 11 12 3l9 8" />
      <path d="M5 10v10h14V10" />
    </>
  ),
  session: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  routines: (
    <>
      <path d="M4 7h3M4 12h3M4 17h3" />
      <path d="M10 7h10M10 12h10M10 17h10" />
    </>
  ),
  catalog: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
    </>
  ),
};
