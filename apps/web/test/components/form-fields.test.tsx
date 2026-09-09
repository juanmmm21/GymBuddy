import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NumberField } from '../../src/components/number-field/NumberField';
import { Select, type SelectOption } from '../../src/components/select/Select';

describe('Select', () => {
  const options: SelectOption[] = [
    { value: 'a', label: 'Press de banca', group: 'Pecho' },
    { value: 'b', label: 'Aperturas', group: 'Pecho' },
    { value: 'c', label: 'Sentadilla', group: 'Piernas' },
  ];

  it('agrupa las opciones y avisa del valor elegido', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select label="Ejercicio" value="a" onChange={onChange} options={options} />);

    const select = screen.getByRole('combobox', { name: 'Ejercicio' });
    expect(select).toHaveValue('a');
    expect(
      within(select)
        .getAllByRole('group')
        .map((group) => group.getAttribute('label')),
    ).toEqual(['Pecho', 'Piernas']);

    await user.selectOptions(select, 'c');
    expect(onChange).toHaveBeenLastCalledWith('c');
  });

  it('las opciones sin grupo van sueltas', () => {
    render(
      <Select
        label="RPE"
        value=""
        onChange={vi.fn()}
        options={[
          { value: '', label: 'Sin anotar' },
          { value: '8', label: 'RPE 8' },
        ]}
      />,
    );

    const select = screen.getByRole('combobox', { name: 'RPE' });
    expect(within(select).queryAllByRole('group')).toHaveLength(0);
    expect(within(select).getAllByRole('option')).toHaveLength(2);
  });
});

describe('NumberField', () => {
  it('confirma lo tecleado al salir del campo, no en cada pulsación', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NumberField label="Repeticiones" value={8} onChange={onChange} min={1} max={1000} />);

    const input = screen.getByLabelText('Repeticiones');
    await user.clear(input);
    await user.type(input, '12');
    expect(onChange).not.toHaveBeenCalled();

    await user.tab();
    expect(onChange).toHaveBeenCalledExactlyOnceWith(12);
  });

  it('los botones suman y restan de uno en uno sin salirse del rango', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NumberField label="Repeticiones" value={1} onChange={onChange} min={1} max={3} />);

    await user.click(screen.getByRole('button', { name: 'Sumar una a repeticiones' }));
    expect(onChange).toHaveBeenLastCalledWith(2);
    expect(screen.getByRole('button', { name: 'Restar una a repeticiones' })).toBeDisabled();
  });

  it('lo que no es un entero del rango se rechaza y se dice', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NumberField label="Repeticiones" value={8} onChange={onChange} min={1} max={10} />);

    const input = screen.getByLabelText('Repeticiones');
    await user.clear(input);
    await user.type(input, '99');
    await user.tab();

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('Escribe un número entre 1 y 10')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('vaciarlo deja el campo sin valor', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NumberField label="Repeticiones" value={8} onChange={onChange} />);

    await user.clear(screen.getByLabelText('Repeticiones'));
    await user.tab();

    expect(onChange).toHaveBeenCalledExactlyOnceWith(null);
  });
});
