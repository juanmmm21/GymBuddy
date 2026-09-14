import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { errorResponse, jsonResponse, type FakeFetch } from '../fake-fetch';
import { session, signals, weeklyCalendar } from '../fixtures';
import { renderApp } from './render-app';

/** La fila del calendario, ya cargada, dentro de su sección. */
async function weekRow(): Promise<HTMLElement> {
  const section = await screen.findByRole('region', { name: 'Esta semana' });
  return within(section).findByRole('list');
}

const serveWeek = (fake: FakeFetch): void => {
  fake.on('GET', '/stats/signals', () => jsonResponse(signals));
  fake.on('GET', '/stats/week', () => jsonResponse(weeklyCalendar));
};

describe('mini calendario de la semana', () => {
  it('pinta los siete días con un botón que dice lo entrenado, sin texto recortado en la columna', async () => {
    renderApp({ path: '/', session, setup: serveWeek });

    const buttons = within(await weekRow()).getAllByRole('button');

    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Lunes: Pecho',
      'Martes: descanso',
      // Entrenó, pero fueron ejercicios propios sin clasificar: no se le inventa una parte.
      'Miércoles: Otro',
      'Jueves: descanso',
      'Viernes: descanso',
      'Sábado: descanso',
      'Domingo: descanso',
    ]);
    // Bajo cada día solo va su inicial: el nombre entero va en el detalle.
    expect(
      within(await weekRow())
        .getAllByRole('listitem')
        .map((day) => day.textContent),
    ).toEqual(['L', 'M', 'X', 'J', 'V', 'S', 'D']);
  });

  it('señala el día de hoy y arranca con su detalle', async () => {
    renderApp({ path: '/', session, setup: serveWeek });

    const days = within(await weekRow()).getAllByRole('listitem');

    // `generatedAt` cae el jueves 10, que es el cuarto día de la semana.
    expect(days[3]?.getAttribute('aria-current')).toBe('date');
    expect(days[0]?.getAttribute('aria-current')).toBeNull();
    expect(screen.getByText(/· Descanso$/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jueves: descanso' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('tocar un día enseña su detalle entero debajo: parte del cuerpo, series y volumen', async () => {
    const user = userEvent.setup();
    renderApp({ path: '/', session, setup: serveWeek });

    await user.click(await screen.findByRole('button', { name: 'Lunes: Pecho' }));

    expect(screen.getByText('Lunes')).toBeInTheDocument();
    expect(screen.getByText(/· Pecho · 3 series · 1480 kg$/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lunes: Pecho' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
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
