import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SESSION_STORAGE_KEY } from '../../src/auth/session-store';
import { errorResponse, jsonResponse } from '../fake-fetch';
import {
  benchPress,
  bodyParts,
  customCurl,
  session,
  sessionPage,
  signals,
  weeklyCalendar,
} from '../fixtures';
import { renderApp } from './render-app';

describe('pantallas del shell', () => {
  it('Hoy resume las señales de entrenamiento', async () => {
    renderApp({
      path: '/',
      session,
      setup: (fake) => {
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
        fake.on('GET', '/stats/week', () => jsonResponse(weeklyCalendar));
      },
    });

    expect(await screen.findByText('3 semanas')).toBeInTheDocument();
    expect(screen.getByText('1 sesión')).toBeInTheDocument();
    expect(screen.getByText('ayer')).toBeInTheDocument();
    expect(screen.getByText('85 kg')).toBeInTheDocument();
    expect(screen.getByText('Peso máximo')).toBeInTheDocument();
  });

  it('Hoy sin historial explica qué va a aparecer', async () => {
    renderApp({
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
  });

  it('Mis ejercicios lista cada uno con su peso habitual', async () => {
    renderApp({
      path: '/exercises',
      session,
      setup: (fake) => {
        fake.on('GET', '/exercises', () => jsonResponse([benchPress, customCurl]));
      },
    });

    expect(await screen.findByText('Press de banca')).toBeInTheDocument();
    expect(screen.getByText('82,5 kg × 8')).toBeInTheDocument();
    expect(screen.getByText('Curl con la barra rara')).toBeInTheDocument();
    expect(screen.getByText('Sin series')).toBeInTheDocument();
    expect(screen.getByText('Pecho')).toBeInTheDocument();
  });

  it('Catálogo ordena las partes del cuerpo y pasa el idioma del usuario', async () => {
    const { fake } = renderApp({
      path: '/catalog',
      session,
      setup: (fake) => {
        fake.on('GET', '/catalog/bodyparts', () => jsonResponse(bodyParts));
      },
    });

    const rows = await screen.findAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      'Pecho163 ejercicios',
      'Brazos329 ejercicios',
    ]);
    expect(fake.requests[0]?.path).toBe('/catalog/bodyparts?lang=es');
  });

  it('Historial muestra las sesiones con su recuento de series', async () => {
    renderApp({
      path: '/history',
      session,
      setup: (fake) => {
        fake.on('GET', '/history/sessions', () => jsonResponse(sessionPage));
      },
    });

    expect(await screen.findByText('12 series')).toBeInTheDocument();
  });

  it('un fallo al cargar se ve y se puede reintentar', async () => {
    const user = userEvent.setup();
    let attempts = 0;
    renderApp({
      path: '/history',
      session,
      setup: (fake) => {
        fake.on('GET', '/history/sessions', () => {
          attempts += 1;
          return attempts === 1
            ? errorResponse('internal_error', 500, 'Se rompió')
            : jsonResponse(sessionPage);
        });
      },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Se rompió');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('12 series')).toBeInTheDocument();
  });

  it('la barra de pestañas navega entre pantallas', async () => {
    const user = userEvent.setup();
    renderApp({
      path: '/',
      session,
      setup: (fake) => {
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
        fake.on('GET', '/exercises', () => jsonResponse([benchPress]));
      },
    });

    await screen.findByRole('heading', { name: 'Hola, Juan' });
    await user.click(screen.getByRole('link', { name: 'Ejercicios' }));
    expect(await screen.findByRole('heading', { name: 'Mis ejercicios' })).toBeInTheDocument();
  });

  it('un 401 del Worker cierra la sesión y vuelve a la entrada', async () => {
    const { storage } = renderApp({
      path: '/',
      session,
      setup: (fake) => {
        fake.on('GET', '/stats/signals', () => errorResponse('unauthorized', 401, 'Sin sesión'));
      },
    });

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(storage.data.has(SESSION_STORAGE_KEY)).toBe(false);
  });

  it('salir borra la sesión guardada', async () => {
    const user = userEvent.setup();
    const { storage } = renderApp({
      path: '/',
      session,
      setup: (fake) => {
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Salir' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    });
    expect(storage.data.has(SESSION_STORAGE_KEY)).toBe(false);
  });
});
