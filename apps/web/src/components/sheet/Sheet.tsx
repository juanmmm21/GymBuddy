import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { useExitAnimation } from '../../hooks/use-exit-animation';
import { afterNextPaint } from '../../lib/animations';
import { sheetDragOffset, sheetDragOutcome } from './sheet-drag';
import styles from './Sheet.module.css';

export interface SheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly children: ReactNode;
}

/** El dedo sobre la cabecera: dónde empezó, cuándo, y cuánto lleva bajada la hoja. */
interface SheetDrag {
  readonly startY: number;
  readonly startedAt: number;
  readonly offset: number;
  /** Con el dedo levantado para cerrar se queda `false`: la hoja se va desde donde la dejó. */
  readonly active: boolean;
}

/**
 * Hoja modal que sube desde abajo, sobre un `<dialog>` nativo: el foco, la tecla Escape
 * y el bloqueo del fondo los resuelve el navegador. El contenido solo se monta mientras
 * está abierta, así que un formulario dentro arranca limpio cada vez.
 *
 * Se cierra con el botón, con Escape, tocando fuera o arrastrándola hacia abajo desde su cabecera,
 * que es el gesto que se hace sin mirar. En los cuatro casos quien manda es el padre: la hoja
 * avisa, y lo que hace por su cuenta es quedarse el tiempo justo de bajarse.
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const exit = useExitAnimation(open, panelRef);
  const titleId = useId();
  const [drag, setDrag] = useState<SheetDrag | null>(null);
  const [placed, setPlaced] = useState(false);

  // Al volver a abrirse no puede acordarse de por dónde iba el dedo la última vez.
  if (open && drag !== null && !drag.active) setDrag(null);
  // Cerrada del todo, la próxima apertura tiene que volver a colocarse antes de subir.
  if (!exit.mounted && placed) setPlaced(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;

    if (exit.mounted && !dialog.open) {
      openDialog(dialog);
    } else if (!exit.mounted && dialog.open) {
      closeDialog(dialog);
    }
  }, [exit.mounted]);

  // Safari en iOS arrancaba la subida en el mismo fotograma en que `showModal` metía el diálogo en
  // la capa superior, con el panel ya desplazado: la hoja subía pegada arriba de la pantalla, se
  // salía por el borde y tardaba en saltar a su sitio. Con un fotograma pintado antes, la hoja en su
  // sitio pero invisible, la animación sale ya desde donde de verdad está.
  useEffect(() => {
    if (!exit.mounted || placed) return;
    return afterNextPaint(() => {
      setPlaced(true);
    });
  }, [exit.mounted, placed]);

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

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (!event.isPrimary) return;
    // El botón de cerrar está dentro de la zona de agarre y no se arrastra: capturar el puntero
    // ahí le robaría su propio clic, porque los eventos de ratón compatibles irían al capturador.
    if (event.target instanceof Element && event.target.closest('button') !== null) return;
    // Con el puntero capturado el gesto sigue llegando aunque el dedo se salga de la cabecera.
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    setDrag({ startY: event.clientY, startedAt: event.timeStamp, offset: 0, active: true });
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (drag === null || !drag.active) return;
    setDrag({ ...drag, offset: sheetDragOffset(event.clientY - drag.startY) });
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>): void => {
    if (drag === null || !drag.active) return;

    const outcome = sheetDragOutcome({
      distance: drag.offset,
      elapsedMs: event.timeStamp - drag.startedAt,
    });
    if (outcome === 'close') {
      setDrag({ ...drag, active: false });
      onClose();
    } else {
      setDrag(null);
    }
  };

  const handlePointerCancel = (): void => {
    // Una llamada, una notificación: el gesto se queda a medias y la hoja vuelve a su sitio.
    if (drag !== null && drag.active) setDrag(null);
  };

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      data-sheet={sheetState(exit.mounted, exit.leaving, placed)}
      onClick={handleBackdropClick}
    >
      {exit.mounted && (
        <div
          ref={panelRef}
          className={styles.panel}
          data-dragging={drag?.active === true ? 'true' : undefined}
          style={dragStyle(drag?.offset ?? 0)}
        >
          <div
            className={styles.handle}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            <div className={styles.grabber} aria-hidden="true" />
            <header className={styles.header}>
              <h2 id={titleId} className={styles.title}>
                {title}
              </h2>
              <button type="button" className={styles.close} onClick={onClose} aria-label="Cerrar">
                ×
              </button>
            </header>
          </div>
          <div className={styles.body}>{children}</div>
        </div>
      )}
    </dialog>
  );
}

/**
 * En qué punto está la hoja, para el CSS y para los tests. `placing` es el fotograma en que el
 * diálogo ya está abierto y la hoja espera en su sitio, invisible, a que el navegador la coloque.
 */
function sheetState(
  mounted: boolean,
  leaving: boolean,
  placed: boolean,
): 'placing' | 'open' | 'leaving' | 'closed' {
  if (!mounted) return 'closed';
  if (leaving) return 'leaving';
  return placed ? 'open' : 'placing';
}

/**
 * Lo que el dedo lleva bajada la hoja. Va en una variable propia y no en un `transform` escrito a
 * mano porque los fotogramas de la salida la leen: así la hoja se va desde donde la soltaste, en
 * vez de saltar a su sitio para irse desde allí.
 */
function dragStyle(offset: number): CSSProperties {
  return { '--sheet-drag': `${String(offset)}px` } as CSSProperties;
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
