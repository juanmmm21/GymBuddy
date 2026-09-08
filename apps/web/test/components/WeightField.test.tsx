import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { WeightField } from '../../src/components/weight-field/WeightField';

function Harness({
  initial,
  onChange,
}: {
  initial: number | null;
  onChange?: (g: number | null) => void;
}) {
  const [grams, setGrams] = useState<number | null>(initial);
  return (
    <>
      <WeightField
        label="Peso"
        valueGrams={grams}
        onChange={(next) => {
          setGrams(next);
          onChange?.(next);
        }}
      />
      <output data-testid="grams">{grams === null ? 'null' : String(grams)}</output>
    </>
  );
}

describe('WeightField', () => {
  it('muestra el peso sin ceros sobrantes', () => {
    render(<Harness initial={82_500} />);
    expect(screen.getByLabelText('Peso')).toHaveValue('82.5');
  });

  it('confirma lo tecleado al salir del campo, en gramos enteros', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={null} onChange={onChange} />);

    const input = screen.getByLabelText('Peso');
    await user.type(input, '82,5');
    expect(onChange).not.toHaveBeenCalled();

    await user.tab();
    expect(onChange).toHaveBeenCalledWith(82_500);
    expect(screen.getByTestId('grams')).toHaveTextContent('82500');
    expect(input).toHaveValue('82.5');
  });

  it('confirma con Intro', async () => {
    const user = userEvent.setup();
    render(<Harness initial={null} />);

    await user.type(screen.getByLabelText('Peso'), '100{Enter}');
    expect(screen.getByTestId('grams')).toHaveTextContent('100000');
  });

  it('marca el valor inválido sin tocar el peso', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={80_000} onChange={onChange} />);

    const input = screen.getByLabelText('Peso');
    await user.clear(input);
    await user.type(input, 'abc');
    await user.tab();

    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/Escribe un peso/)).toBeInTheDocument();
    expect(screen.getByTestId('grams')).toHaveTextContent('80000');
  });

  it('vaciar el campo deja el peso a null', async () => {
    const user = userEvent.setup();
    render(<Harness initial={80_000} />);

    await user.clear(screen.getByLabelText('Peso'));
    await user.tab();
    expect(screen.getByTestId('grams')).toHaveTextContent('null');
  });

  it('los botones suman y restan el salto elegido', async () => {
    const user = userEvent.setup();
    render(<Harness initial={80_000} />);

    await user.click(screen.getByRole('button', { name: 'Sumar 2.5 kg' }));
    expect(screen.getByTestId('grams')).toHaveTextContent('82500');

    await user.click(screen.getByRole('button', { name: '1.25' }));
    await user.click(screen.getByRole('button', { name: 'Restar 1.25 kg' }));
    expect(screen.getByTestId('grams')).toHaveTextContent('81250');
    expect(screen.getByLabelText('Peso')).toHaveValue('81.25');

    await user.click(screen.getByRole('button', { name: '5' }));
    await user.click(screen.getByRole('button', { name: 'Sumar 5 kg' }));
    expect(screen.getByTestId('grams')).toHaveTextContent('86250');
  });

  it('no permite restar por debajo de cero', () => {
    render(<Harness initial={null} />);
    expect(screen.getByRole('button', { name: /Restar/ })).toBeDisabled();
  });
});
