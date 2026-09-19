import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SkeletonList } from '../../src/components/skeleton/SkeletonList';

describe('SkeletonList', () => {
  it('anuncia la espera una sola vez, por mucho hueco que dibuje', () => {
    render(<SkeletonList rows={6} />);

    const waiting = screen.getAllByRole('status');
    expect(waiting).toHaveLength(1);
    expect(waiting[0]).toHaveAccessibleName('Cargando');
  });

  it('dibuja tantas filas como se le piden, y los huecos no se leen', () => {
    const { container } = render(<SkeletonList rows={3} />);

    expect(container.querySelectorAll('[role="status"] > *')).toHaveLength(3);
    for (const block of container.querySelectorAll('span[aria-hidden="true"]')) {
      expect(block).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('sin miniatura hay dos huecos de texto y uno de etiqueta por fila; con ella, uno más', () => {
    const { container: plain } = render(<SkeletonList rows={1} />);
    const { container: withThumb } = render(<SkeletonList rows={1} thumb />);

    expect(plain.querySelectorAll('span[aria-hidden="true"]')).toHaveLength(3);
    expect(withThumb.querySelectorAll('span[aria-hidden="true"]')).toHaveLength(4);
  });

  it('nunca se queda sin ninguna fila', () => {
    const { container } = render(<SkeletonList rows={0} />);

    expect(container.querySelectorAll('[role="status"] > *')).toHaveLength(1);
  });

  it('puede decir qué es lo que se está esperando', () => {
    render(<SkeletonList label="Cargando el historial" />);

    expect(screen.getByRole('status')).toHaveAccessibleName('Cargando el historial');
  });
});
