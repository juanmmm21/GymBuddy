import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from 'react';
import styles from './Sheet.module.css';

export interface SheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly children: ReactNode;
}

/**
 * Hoja modal que sube desde abajo, sobre un `<dialog>` nativo: el foco, la tecla Escape
 * y el bloqueo del fondo los resuelve el navegador. El contenido solo se monta mientras
 * está abierta, así que un formulario dentro arranca limpio cada vez.
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;

    if (open && !dialog.open) {
      openDialog(dialog);
    } else if (!open && dialog.open) {
      closeDialog(dialog);
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;

    // Escape dispara `cancel`: se intercepta para que el estado de React mande y el
    // diálogo no se cierre por su cuenta dejando `open` a true en el padre.
    const handleCancel = (event: Event): void => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener('cancel', handleCancel);
    return () => {
      dialog.removeEventListener('cancel', handleCancel);
    };
  }, [onClose]);

  const handleBackdropClick = (event: MouseEvent<HTMLDialogElement>): void => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      onClick={handleBackdropClick}
    >
      {open && (
        <div className={styles.panel}>
          <div className={styles.grabber} aria-hidden="true" />
          <header className={styles.header}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            <button type="button" className={styles.close} onClick={onClose} aria-label="Cerrar">
              ×
            </button>
          </header>
          <div className={styles.body}>{children}</div>
        </div>
      )}
    </dialog>
  );
}

/**
 * `showModal` es lo que bloquea el fondo y atrapa el foco. Los navegadores sin él (y
 * jsdom) reciben el atributo `open` a secas: la hoja se ve, aunque sin modalidad.
 */
function openDialog(dialog: HTMLDialogElement): void {
  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }
}

/** El cierre va en espejo con la apertura: donde no hay `close`, se quita el atributo. */
function closeDialog(dialog: HTMLDialogElement): void {
  if (typeof dialog.close === 'function') {
    dialog.close();
  } else {
    dialog.removeAttribute('open');
  }
}
