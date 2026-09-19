import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useLastPresent } from '../../src/hooks/use-last-present';

function Probe({ value }: { readonly value: string | null }) {
  return <p data-testid="shown">{useLastPresent(value) ?? 'nada'}</p>;
}

function shown(): string {
  return screen.getByTestId('shown').textContent ?? '';
}

describe('lo último que hubo', () => {
  it('mientras hay valor, enseña el valor', () => {
    const { rerender } = render(<Probe value="una serie" />);
    expect(shown()).toBe('una serie');

    rerender(<Probe value="otra serie" />);
    expect(shown()).toBe('otra serie');
  });

  it('al quedarse sin valor, sigue enseñando el último', () => {
    const { rerender } = render(<Probe value="una serie" />);

    rerender(<Probe value={null} />);

    expect(shown()).toBe('una serie');
  });

  it('sin haber tenido ninguno, no se inventa nada', () => {
    render(<Probe value={null} />);
    expect(shown()).toBe('nada');
  });
});
