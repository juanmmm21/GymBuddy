import { screen } from '@testing-library/react';
import type { TrackedExercise } from '@gymbuddy/shared';
import { describe, expect, it } from 'vitest';
import { jsonResponse, type FakeFetch } from '../fake-fetch';
import { benchPress, benchPressHistory, benchPressStats, session } from '../fixtures';
import { renderApp } from './render-app';

const DETAIL_PATH = `/exercises/${benchPress.id}`;

function serveBenchPress(fake: FakeFetch, exercise: TrackedExercise = benchPress): void {
  fake.on('GET', '/exercises', () => jsonResponse([exercise]));
  fake.on('GET', `/stats/exercise/${benchPress.id}`, () => jsonResponse(benchPressStats));
  fake.on('GET', `/history/exercises/${benchPress.id}`, () => jsonResponse(benchPressHistory));
}

/** Monta la ficha del press de banca y devuelve su gráfica ya pintada. */
async function renderChart(): Promise<HTMLElement> {
  renderApp({ path: DETAIL_PATH, session, setup: serveBenchPress });
  return screen.findByRole('img', { name: /^Peso y 1RM estimado/ });
}

describe('la gráfica se dibuja al aparecer', () => {
  it('la línea del peso lleva su longitud normalizada: se dibuja sin medir el nodo', async () => {
    const line = (await renderChart()).querySelector('[data-chart-line="weight"]');

    expect(line).not.toBeNull();
    expect(line).toHaveAttribute('pathLength', '1');
  });

  it('el 1RM, los puntos y las marcas entran juntos detrás de la línea', async () => {
    const reveal = (await renderChart()).querySelector('[data-chart-reveal="true"]');

    expect(reveal).not.toBeNull();
    // La discontinua no puede dibujarse como la sólida: su guion es lo que la hace discontinua.
    expect(reveal?.querySelector('[data-chart-line="one-rep-max"]')).not.toBeNull();
    expect(reveal?.querySelector('[data-chart-line="one-rep-max"]')).not.toHaveAttribute(
      'pathLength',
    );
    // Los cuatro puntos de las sesiones y las dos marcas van dentro, no sueltos por el lienzo.
    expect(reveal?.querySelectorAll('circle')).toHaveLength(6);
  });

  it('el resumen de la gráfica está entero desde el primer momento', async () => {
    const svg = await renderChart();

    expect(svg.getAttribute('aria-label')).toMatch(/^Peso y 1RM estimado en 4 sesiones:/);
  });
});
