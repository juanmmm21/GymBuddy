import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CountUp } from '../../src/components/index';
import { COUNT_UP_DURATION_MS } from '../../src/lib/count-up';

const originalRequest = window.requestAnimationFrame;
const originalCancel = window.cancelAnimationFrame;

/** Los fotogramas los sirve el test con su propio reloj: así la cuenta se mira paso a paso. */
function stubFrames(): { serve: (timestamp: number) => void; readonly pending: number } {
  const callbacks = new Map<number, FrameRequestCallback>();
  let handle = 0;

  window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
    handle += 1;
    callbacks.set(handle, callback);
    return handle;
  };
  window.cancelAnimationFrame = (given: number): void => {
    callbacks.delete(given);
  };

  return {
    serve(timestamp: number): void {
      const due = [...callbacks.values()];
      callbacks.clear();
      act(() => {
        for (const callback of due) callback(timestamp);
      });
    },
    get pending(): number {
      return callbacks.size;
    },
  };
}

/** jsdom no trae `matchMedia`: los tests que necesitan una preferencia concreta la ponen. */
function stubMotionPreference(reduce: boolean): void {
  window.matchMedia = ((query: string) => ({
    media: query,
    matches: reduce,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

/** La cifra es el único hijo de la caja: `CountUp` pinta un `span` y nada más. */
function figure(): HTMLElement {
  const span = screen.getByTestId('box').firstElementChild;
  if (!(span instanceof HTMLElement)) throw new Error('la cifra no se pintó');
  return span;
}

function Weeks({ value }: { readonly value: number }) {
  return (
    <p data-testid="box">
      <CountUp value={value} format={(weeks) => `${String(weeks)} semanas`} />
    </p>
  );
}

afterEach(() => {
  window.requestAnimationFrame = originalRequest;
  window.cancelAnimationFrame = originalCancel;
  // @ts-expect-error jsdom no define `matchMedia`: se deja el entorno como estaba.
  delete window.matchMedia;
});

describe('cifras que cuentan hasta su valor', () => {
  it('sin poder preguntar por el movimiento, la cifra sale entera desde el primer pintado', () => {
    render(<Weeks value={12} />);

    expect(figure()).toHaveTextContent('12 semanas');
    expect(figure()).not.toHaveAttribute('data-counting');
    expect(figure()).not.toHaveAttribute('aria-hidden');
  });

  it('cuenta desde cero y solo se deja leer cuando llega', () => {
    stubMotionPreference(false);
    const frames = stubFrames();

    render(<Weeks value={12} />);
    expect(figure()).toHaveTextContent('0 semanas');
    expect(figure()).toHaveAttribute('aria-hidden', 'true');

    frames.serve(0);
    frames.serve(COUNT_UP_DURATION_MS / 2);
    const halfway = Number.parseInt(figure().textContent ?? '', 10);
    expect(halfway).toBeGreaterThan(0);
    expect(halfway).toBeLessThan(12);
    expect(figure()).toHaveAttribute('data-counting', 'true');

    frames.serve(COUNT_UP_DURATION_MS);
    expect(figure()).toHaveTextContent('12 semanas');
    expect(figure()).not.toHaveAttribute('aria-hidden');
    // Llegar es dejar de pedir fotogramas: nada sigue dando vueltas detrás de una cifra quieta.
    expect(frames.pending).toBe(0);
  });

  it('quien pide menos movimiento no ve ninguna cuenta', () => {
    stubMotionPreference(true);
    stubFrames();

    render(<Weeks value={12} />);

    expect(figure()).toHaveTextContent('12 semanas');
    expect(figure()).not.toHaveAttribute('data-counting');
  });

  it('un valor que cambia a media cuenta sigue desde donde iba, no desde cero', () => {
    stubMotionPreference(false);
    const frames = stubFrames();

    const { rerender } = render(<Weeks value={12} />);
    frames.serve(0);
    frames.serve(COUNT_UP_DURATION_MS / 2);
    const halfway = Number.parseInt(figure().textContent ?? '', 10);

    rerender(<Weeks value={20} />);
    expect(Number.parseInt(figure().textContent ?? '', 10)).toBe(halfway);

    frames.serve(COUNT_UP_DURATION_MS);
    frames.serve(COUNT_UP_DURATION_MS * 2);
    expect(figure()).toHaveTextContent('20 semanas');
  });
});
