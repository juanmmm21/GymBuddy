import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { PendingWrite } from '../../src/offline/pending-write';
import { errorResponse, jsonResponse } from '../fake-fetch';
import {
  benchPress,
  pastSession,
  session,
  sessionHistoryPage,
  sessionSummaries,
  squat,
  user,
} from '../fixtures';
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

  it('una serie de cardio se lee con su duración y su distancia, sin kilos ni volumen', async () => {
    const withCardio = {
      ...pastSession,
      sets: [
        ...pastSession.sets,
        {
          id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
          kind: 'cardio' as const,
          trackedExerciseId: squat.id,
          orderIndex: 3,
          durationSeconds: 1_830,
          distanceMeters: 5_250,
          rpe: null,
          isWarmup: false,
          completedAt: '2026-09-06T19:00:00.000Z',
        },
      ],
    };
    renderApp({
      path: `/history/${pastSession.id}`,
      session,
      setup: (fake) => {
        fake.on('GET', `/sessions/${pastSession.id}`, () => jsonResponse(withCardio));
        fake.on('GET', '/exercises', () => jsonResponse([benchPress, squat]));
      },
    });

    expect(await screen.findByText('30 min 30 s · 5,25 km')).toBeInTheDocument();
    // Cuenta como serie, pero el volumen sigue siendo el de las de fuerza.
    expect(screen.getByText('3 series')).toBeInTheDocument();
    expect(screen.getByText('1010 kg')).toBeInTheDocument();
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

  it('borra el entrenamiento tras confirmarlo y vuelve al historial sin él', async () => {
    const actor = userEvent.setup();
    let deleted = false;
    const { fake } = renderApp({
      path: `/history/${pastSession.id}`,
      session,
      setup: (fake) => {
        fake.on('GET', `/sessions/${pastSession.id}`, () => jsonResponse(pastSession));
        fake.on('GET', '/exercises', () => jsonResponse([benchPress, squat]));
        fake.on('DELETE', `/sessions/${pastSession.id}`, () => {
          deleted = true;
          return new Response(null, { status: 204 });
        });
        fake.on('GET', '/history/sessions', () =>
          jsonResponse(
            deleted ? sessionHistoryPage([], 0) : sessionHistoryPage(sessionSummaries(3), 3),
          ),
        );
      },
    });

    await actor.click(await screen.findByRole('button', { name: 'Borrar entrenamiento' }));
    expect(screen.getByText('¿Borrar este entrenamiento?')).toBeInTheDocument();
    expect(screen.getByText(/y con él 2 series/)).toBeInTheDocument();
    // Pedir la confirmación todavía no borra nada.
    expect(fake.requests.some((request) => request.method === 'DELETE')).toBe(false);

    await actor.click(screen.getByRole('button', { name: 'Sí, borrarlo' }));

    expect(await screen.findByText('Aún no hay sesiones')).toBeInTheDocument();
    expect(
      fake.requests.filter((request) => request.method === 'DELETE').map((request) => request.path),
    ).toEqual([`/sessions/${pastSession.id}`]);
    // El detalle borrado no se relee antes de irse: sería un «no existe» a destiempo.
    expect(
      fake.requests.filter(
        (request) => request.method === 'GET' && request.path === `/sessions/${pastSession.id}`,
      ),
    ).toHaveLength(1);
  });

  it('cancelar la confirmación deja el entrenamiento como estaba', async () => {
    const actor = userEvent.setup();
    const { fake } = renderApp({
      path: `/history/${pastSession.id}`,
      session,
      setup: (fake) => {
        fake.on('GET', `/sessions/${pastSession.id}`, () => jsonResponse(pastSession));
        fake.on('GET', '/exercises', () => jsonResponse([benchPress, squat]));
      },
    });

    await actor.click(await screen.findByRole('button', { name: 'Borrar entrenamiento' }));
    await actor.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByText('¿Borrar este entrenamiento?')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Borrar entrenamiento' })).toBeInTheDocument();
    expect(fake.requests.some((request) => request.method === 'DELETE')).toBe(false);
  });

  it('si el Worker no puede borrarlo lo dice y se queda en la pantalla', async () => {
    const actor = userEvent.setup();
    renderApp({
      path: `/history/${pastSession.id}`,
      session,
      setup: (fake) => {
        fake.on('GET', `/sessions/${pastSession.id}`, () => jsonResponse(pastSession));
        fake.on('GET', '/exercises', () => jsonResponse([benchPress, squat]));
        fake.on('DELETE', `/sessions/${pastSession.id}`, () =>
          errorResponse('internal_error', 500, 'Algo falló al borrar'),
        );
      },
    });

    await actor.click(await screen.findByRole('button', { name: 'Borrar entrenamiento' }));
    await actor.click(screen.getByRole('button', { name: 'Sí, borrarlo' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('No se pudo borrar')).toBeInTheDocument();
    expect(screen.getByText('1 h 5 min')).toBeInTheDocument();
  });

  it('una sesión todavía abierta no ofrece borrarse desde el historial', async () => {
    renderApp({
      path: `/history/${pastSession.id}`,
      session,
      setup: (fake) => {
        fake.on('GET', `/sessions/${pastSession.id}`, () =>
          jsonResponse({ ...pastSession, endedAt: null }),
        );
        fake.on('GET', '/exercises', () => jsonResponse([benchPress, squat]));
      },
    });

    expect(await screen.findByText('Esta sesión sigue abierta')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Borrar entrenamiento' })).not.toBeInTheDocument();
  });

  it('con cambios de esa sesión en la cola espera a que lleguen antes de dejar borrarla', async () => {
    const queuedEnd: PendingWrite = {
      sequence: 0,
      userId: user.id,
      queuedAt: '2026-09-08T19:10:00.000Z',
      write: {
        kind: 'end_session',
        sessionId: pastSession.id,
        body: { endedAt: '2026-09-08T19:10:00.000Z' },
      },
    };
    renderApp({
      path: `/history/${pastSession.id}`,
      session,
      queued: [queuedEnd],
      setup: (fake) => {
        fake.on('GET', `/sessions/${pastSession.id}`, () => jsonResponse(pastSession));
        fake.on('GET', '/exercises', () => jsonResponse([benchPress, squat]));
        // El Worker no contesta: el cierre se queda esperando en la cola.
        fake.on('POST', `/sessions/${pastSession.id}/end`, () =>
          errorResponse('internal_error', 503, 'Caído'),
        );
      },
    });

    expect(await screen.findByText(/sin sincronizar\. Podrás borrarlo/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Borrar entrenamiento' })).not.toBeInTheDocument();
  });

  it('un identificador que no es un UUID no llega al Worker', async () => {
    const { fake } = renderApp({ path: '/history/no-es-un-id', session });

    expect(await screen.findByText('No existe esa sesión')).toBeInTheDocument();
    // La barra de pestañas pregunta por la sesión en curso en cualquier pantalla; lo que no
    // puede salir es la lectura del identificador roto.
    expect(fake.requests.filter((request) => request.path !== '/sessions/active')).toEqual([]);
  });
});
