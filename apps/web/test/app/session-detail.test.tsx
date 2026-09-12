import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { errorResponse, jsonResponse } from '../fake-fetch';
import { benchPress, pastSession, session, squat } from '../fixtures';
import { renderApp } from './render-app';

describe('detalle de una sesión pasada', () => {
  it('el detalle resume la sesión y agrupa sus series por ejercicio', async () => {
    renderApp({
      path: `/history/${pastSession.id}`,
      session,
      setup: (fake) => {
        fake.on('GET', `/sessions/${pastSession.id}`, () => jsonResponse(pastSession));
        fake.on('GET', '/exercises', () => jsonResponse([benchPress, squat]));
      },
    });

    expect(await screen.findByText('1 h 5 min')).toBeInTheDocument();
    // El calentamiento no cuenta como serie efectiva ni suma volumen: 85×6 + 100×5.
    expect(screen.getByText('2 series')).toBeInTheDocument();
    expect(screen.getByText('2 ejercicios')).toBeInTheDocument();
    expect(screen.getByText('1010 kg')).toBeInTheDocument();
    expect(screen.getByText('Buen día, la barra subía sola.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Press de banca' })).toHaveAttribute(
      'href',
      `/exercises/${benchPress.id}`,
    );
    expect(screen.getByText('85 kg × 6')).toBeInTheDocument();
    expect(screen.getByText('RPE 8,5')).toBeInTheDocument();
    expect(screen.getByText('Calentamiento')).toBeInTheDocument();
  });

  it('una sesión sin series lo dice en vez de quedarse en blanco', async () => {
    renderApp({
      path: `/history/${pastSession.id}`,
      session,
      setup: (fake) => {
        fake.on('GET', `/sessions/${pastSession.id}`, () =>
          jsonResponse({ ...pastSession, notes: null, sets: [] }),
        );
        fake.on('GET', '/exercises', () => jsonResponse([benchPress]));
      },
    });

    expect(await screen.findByText('Esta sesión no tiene ninguna serie')).toBeInTheDocument();
  });

  it('una sesión ajena o inexistente avisa con el mensaje del Worker', async () => {
    renderApp({
      path: `/history/${pastSession.id}`,
      session,
      setup: (fake) => {
        fake.on('GET', `/sessions/${pastSession.id}`, () =>
          errorResponse('not_found', 404, 'Esa sesión no existe'),
        );
        fake.on('GET', '/exercises', () => jsonResponse([benchPress]));
      },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Esa sesión no existe');
  });

  it('un identificador que no es un UUID no llega al Worker', async () => {
    const { fake } = renderApp({ path: '/history/no-es-un-id', session });

    expect(await screen.findByText('No existe esa sesión')).toBeInTheDocument();
    expect(fake.requests).toHaveLength(0);
  });
});
