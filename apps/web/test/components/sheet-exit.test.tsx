import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Sheet, SHEET_DRAG_CLOSE_DISTANCE } from '../../src/components/index';

/** La hoja, esté abierta, yéndose o cerrada. */
function sheet(): HTMLElement {
  return screen.getByRole('dialog', { hidden: true });
}

/** El panel que sube: el único hijo de la hoja mientras está puesta. */
function panel(): HTMLElement {
  const found = sheet().firstElementChild;
  if (found === null) throw new Error('la hoja está cerrada');
  return found as HTMLElement;
}

/** La zona por la que se agarra: el tirador y la cabecera, lo primero del panel. */
function handle(): HTMLElement {
  const found = panel().firstElementChild;
  if (found === null) throw new Error('la hoja no tiene por dónde cogerse');
  return found as HTMLElement;
}

/** Lo que el dedo lleva bajada la hoja, tal y como lo lee el CSS. */
function dragOffset(): string {
  return panel().style.getPropertyValue('--sheet-drag');
}

/** Baja la hoja con el dedo desde la cabecera y lo levanta. */
function dragDown(distance: number): void {
  const target = handle();
  fireEvent.pointerDown(target, { pointerId: 1, isPrimary: true, clientY: 0 });
  fireEvent.pointerMove(target, { pointerId: 1, isPrimary: true, clientY: distance });
  fireEvent.pointerUp(target, { pointerId: 1, isPrimary: true, clientY: distance });
}

function renderSheet(open: boolean, onClose: () => void) {
  return render(
    <Sheet open={open} onClose={onClose} title="Serie">
      <p>contenido</p>
    </Sheet>,
  );
}

describe('la hoja se va bajándose', () => {
  it('sigue puesta mientras se recoge y solo después se cierra', async () => {
    const { rerender } = renderSheet(true, () => undefined);
    expect(sheet()).toHaveAttribute('data-sheet', 'open');

    rerender(
      <Sheet open={false} onClose={() => undefined} title="Serie">
        <p>contenido</p>
      </Sheet>,
    );

    // Todavía en pantalla, y marcada como que se va: es lo que el CSS anima.
    expect(sheet()).toHaveAttribute('data-sheet', 'leaving');
    expect(screen.getByText('contenido')).toBeInTheDocument();

    await waitFor(() => expect(sheet()).toHaveAttribute('data-sheet', 'closed'));
    expect(screen.queryByText('contenido')).not.toBeInTheDocument();
    expect(sheet()).not.toHaveAttribute('open');
  });
});

describe('arrastrar la hoja en pantalla', () => {
  it('bajarla del todo avisa al padre, como el botón de cerrar', () => {
    const onClose = vi.fn();
    renderSheet(true, onClose);

    dragDown(SHEET_DRAG_CLOSE_DISTANCE);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('bajarla un poco la devuelve a su sitio sin cerrar nada', () => {
    const onClose = vi.fn();
    renderSheet(true, onClose);

    dragDown(8);

    expect(onClose).not.toHaveBeenCalled();
    expect(dragOffset()).toBe('0px');
  });

  it('mientras el dedo la baja, la hoja va con él', () => {
    renderSheet(true, () => undefined);
    const target = handle();

    fireEvent.pointerDown(target, { pointerId: 1, isPrimary: true, clientY: 100 });
    fireEvent.pointerMove(target, { pointerId: 1, isPrimary: true, clientY: 140 });

    expect(dragOffset()).toBe('40px');
    expect(panel()).toHaveAttribute('data-dragging', 'true');
  });

  it('el botón de cerrar no se arrastra: es suyo el toque', () => {
    // Si el gesto empezara ahí, el puntero capturado se quedaría con su clic y cerrar dejaría de
    // funcionar en el móvil.
    renderSheet(true, () => undefined);
    const close = screen.getByRole('button', { name: 'Cerrar' });

    fireEvent.pointerDown(close, { pointerId: 1, isPrimary: true, clientY: 0 });
    fireEvent.pointerMove(handle(), { pointerId: 1, isPrimary: true, clientY: 60 });

    expect(dragOffset()).toBe('0px');
    expect(panel()).not.toHaveAttribute('data-dragging');
  });

  it('empujarla hacia arriba no la despega de abajo', () => {
    renderSheet(true, () => undefined);
    const target = handle();

    fireEvent.pointerDown(target, { pointerId: 1, isPrimary: true, clientY: 100 });
    fireEvent.pointerMove(target, { pointerId: 1, isPrimary: true, clientY: 20 });

    expect(dragOffset()).toBe('0px');
  });
});
