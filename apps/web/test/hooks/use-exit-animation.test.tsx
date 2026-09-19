import { render, screen, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useExitAnimation } from '../../src/hooks/use-exit-animation';

function Probe({ present }: { readonly present: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const exit = useExitAnimation(present, ref);
  if (!exit.mounted) return null;

  return <div ref={ref} data-testid="thing" data-leaving={exit.leaving ? 'true' : 'false'} />;
}

function thing(): HTMLElement | null {
  return screen.queryByTestId('thing');
}

/** jsdom no trae Web Animations: los tests que la necesitan la ponen y la quitan. */
function stubAnimations(animations: readonly Animation[]): void {
  Element.prototype.getAnimations = () => [...animations];
}

afterEach(() => {
  // @ts-expect-error jsdom no define `getAnimations`: se devuelve el prototipo a como estaba.
  delete Element.prototype.getAnimations;
});

describe('lo que se va se queda hasta que termina de irse', () => {
  it('aparece al hacer falta y se queda mientras se va', async () => {
    const { rerender } = render(<Probe present={false} />);
    expect(thing()).not.toBeInTheDocument();

    rerender(<Probe present />);
    expect(thing()).toHaveAttribute('data-leaving', 'false');

    rerender(<Probe present={false} />);
    expect(thing()).toHaveAttribute('data-leaving', 'true');

    await waitFor(() => expect(thing()).not.toBeInTheDocument());
  });

  it('sin animaciones que esperar se quita en cuanto puede, no al instante', async () => {
    const { rerender } = render(<Probe present />);

    rerender(<Probe present={false} />);
    // Aún puesto: quitarlo en el mismo commit es justo lo que impide animar la salida.
    expect(thing()).toBeInTheDocument();

    await waitFor(() => expect(thing()).not.toBeInTheDocument());
  });

  it('espera a que la animación acabe de verdad', async () => {
    let end: () => void = () => undefined;
    const finished = new Promise<void>((resolve) => {
      end = resolve;
    });
    stubAnimations([{ finished } as unknown as Animation]);

    const { rerender } = render(<Probe present />);
    rerender(<Probe present={false} />);

    await Promise.resolve();
    expect(thing()).toHaveAttribute('data-leaving', 'true');

    end();
    await waitFor(() => expect(thing()).not.toBeInTheDocument());
  });

  it('volver a hacer falta a media salida lo deja puesto', async () => {
    const never = new Promise<void>(() => undefined);
    stubAnimations([{ finished: never } as unknown as Animation]);

    const { rerender } = render(<Probe present />);
    rerender(<Probe present={false} />);
    rerender(<Probe present />);

    await Promise.resolve();
    expect(thing()).toHaveAttribute('data-leaving', 'false');
  });
});
