import { barbellLoad } from '@gymbuddy/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PlateStack, describeLoad } from '../../src/components/plate-stack/PlateStack';
import { usesOlympicBar } from '../../src/features/exercises/equipment';

describe('PlateStack', () => {
  it('dibuja un lado de la barra y dice los discos por lado', () => {
    render(<PlateStack weight="102.50" locale="es" />);

    expect(
      screen.getByRole('img', { name: 'Por lado: 25 kg, 15 kg y 1,25 kg' }),
    ).toBeInTheDocument();
  });

  it('con la barra sola lo dice, y por debajo de la barra no dibuja nada', () => {
    const { rerender } = render(<PlateStack weight="20.00" locale="es" />);
    expect(screen.getByRole('img', { name: 'Barra sola, sin discos' })).toBeInTheDocument();

    rerender(<PlateStack weight="15.00" locale="es" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('lo que no se puede cargar exacto se escribe al lado', () => {
    render(<PlateStack weight="81.00" locale="es" />);

    expect(screen.getByText('+1 kg')).toBeInTheDocument();
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('faltan 1 kg');
  });

  it('en inglés el decimal va con punto', () => {
    const load = barbellLoad(102_500);
    if (load === null) throw new Error('102,5 kg llenan una barra');

    expect(describeLoad(load, 'en')).toBe('Por lado: 25 kg, 15 kg y 1.25 kg');
  });
});

describe('usesOlympicBar', () => {
  it('solo la barra olímpica lleva discos dibujados', () => {
    expect(usesOlympicBar('barbell')).toBe(true);
    for (const equipment of ['smith', 'ez-bar', 'dumbbell', 'cable', 'lever', null]) {
      expect(usesOlympicBar(equipment)).toBe(false);
    }
  });
});
