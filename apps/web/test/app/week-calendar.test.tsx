import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { errorResponse, jsonResponse } from '../fake-fetch';
import { session, signals, weeklyCalendar } from '../fixtures';
import { renderApp } from './render-app';

/** La fila del calendario, ya cargada: es la única lista de Hoy. */
async function weekRow(): Promise<HTMLElement> {
  return screen.findByRole('list');
}

describe('mini calendario de la semana', () => {
  it('pinta los siete días con una sola etiqueta cada uno', async () => {
    renderApp({
      path: '/',
      session,
      setup: (fake) => {
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
        fake.on('GET', '/stats/week', () => jsonResponse(weeklyCalendar));
      },
    });

    const days = within(await weekRow()).getAllByRole('listitem');

    expect(days).toHaveLength(7);
    expect(days.map((day) => day.textContent)).toEqual([
      'LLunes: Pecho',
      'MMartes: —',
      // Entrenó, pero fueron ejercicios propios sin clasificar: no se le inventa una parte.
      'XMiércoles: Otro',
      'JJueves: —',
      'VViernes: —',
      'SSábado: —',
      'DDomingo: —',
    ]);
  });

  it('señala el día de hoy', async () => {
    renderApp({
      path: '/',
      session,
      setup: (fake) => {
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
        fake.on('GET', '/stats/week', () => jsonResponse(weeklyCalendar));
      },
    });

    const days = within(await weekRow()).getAllByRole('listitem');

    // `generatedAt` cae el jueves 10, que es el cuarto día de la semana.
    expect(days[3]?.getAttribute('aria-current')).toBe('date');
    expect(days[0]?.getAttribute('aria-current')).toBeNull();
  });

  it('el detalle del día cabe en el tooltip, no en la columna', async () => {
    renderApp({
      path: '/',
      session,
      setup: (fake) => {
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
        fake.on('GET', '/stats/week', () => jsonResponse(weeklyCalendar));
      },
    });

    expect(await screen.findByTitle('3 series · 1480 kg')).toBeInTheDocument();
    expect(screen.getAllByTitle('Descanso')).toHaveLength(5);
  });

  it('si la semana falla, el resto de Hoy sigue en pie', async () => {
    renderApp({
      path: '/',
      session,
      setup: (fake) => {
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
        fake.on('GET', '/stats/week', () =>
          errorResponse('internal_error', 500, 'No se pudo calcular la semana'),
        );
      },
    });

    expect(await screen.findByText('No se pudo cargar')).toBeInTheDocument();
    // Las señales son otra consulta: su fallo no se lleva por delante la pantalla entera.
    expect(screen.getByText('3 semanas')).toBeInTheDocument();
  });

  it('sin haber entrenado nunca no se pide la semana: no hay nada que repartir', async () => {
    const { fake } = renderApp({
      path: '/',
      session,
      setup: (fake) => {
        fake.on('GET', '/stats/signals', () =>
          jsonResponse({
            ...signals,
            lastSessionAt: null,
            daysSinceLastSession: null,
            weeklyStreak: 0,
            sessionsThisWeek: 0,
            latestRecord: null,
          }),
        );
      },
    });

    expect(await screen.findByText('Todavía no has entrenado')).toBeInTheDocument();
    expect(fake.requests.some((request) => request.path === '/stats/week')).toBe(false);
  });
});
