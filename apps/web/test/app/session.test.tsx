import type {
  LogSetRequest,
  SetEntry,
  StartSessionRequest,
  UpdateSetRequest,
  WorkoutSessionDetail,
} from '@gymbuddy/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { errorResponse, jsonResponse, type FakeFetch } from '../fake-fetch';
import {
  activeSession,
  benchPress,
  newMaxWeightRecord,
  session,
  signals,
  squat,
} from '../fixtures';
import { renderApp } from './render-app';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Una sesión abierta con sus ejercicios: el punto de partida de casi todo lo de aquí. */
function serveActiveSession(fake: FakeFetch, current: WorkoutSessionDetail = activeSession): void {
  fake.on('GET', '/sessions/active', () => jsonResponse({ session: current }));
  fake.on('GET', '/exercises', () => jsonResponse([benchPress, squat]));
}

describe('sesión: sin ninguna abierta', () => {
  it('ofrece empezar y abre una con un identificador del cliente', async () => {
    const user = userEvent.setup();
    let opened: WorkoutSessionDetail | null = null;
    const { fake } = renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        fake.on('GET', '/sessions/active', () => jsonResponse({ session: opened }));
        fake.on('GET', '/exercises', () => jsonResponse([benchPress, squat]));
        fake.on('POST', '/sessions', (request) => {
          const body = request.body as StartSessionRequest;
          opened = { ...activeSession, id: body.id, sets: [] };
          return jsonResponse({ ...opened, sets: undefined, endedAt: null });
        });
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Empezar a entrenar' }));

    expect(await screen.findByText('Todavía no has registrado ninguna serie')).toBeInTheDocument();
    const post = fake.requests.find((request) => request.path === '/sessions');
    const body = post?.body as StartSessionRequest;
    expect(body.source).toBe('web');
    expect(body.id).toMatch(UUID);
  });

  it('un fallo al empezar se ve y deja reintentar', async () => {
    const user = userEvent.setup();
    renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        fake.on('GET', '/sessions/active', () => jsonResponse({ session: null }));
        fake.on('GET', '/exercises', () => jsonResponse([benchPress]));
        fake.on('POST', '/sessions', () => errorResponse('internal_error', 500, 'Se rompió'));
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Empezar a entrenar' }));

    expect(await screen.findByText('No se pudo empezar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Empezar a entrenar' })).toBeEnabled();
  });
});

describe('sesión en curso', () => {
  it('agrupa lo hecho por ejercicio y cronometra el descanso desde la última serie', async () => {
    renderApp({ path: '/session', session, setup: serveActiveSession });

    expect(await screen.findByRole('heading', { name: 'Press de banca' })).toBeInTheDocument();
    expect(screen.getByText('82,5 kg × 8')).toBeInTheDocument();
    expect(screen.getByText('En curso')).toBeInTheDocument();

    const rest = within(screen.getByRole('region', { name: 'Descanso' }));
    expect(rest.getByText(/Descanso cumplido/)).toBeInTheDocument();
    // El objetivo por defecto son dos minutos y se puede cambiar de un toque.
    expect(rest.getByRole('button', { name: '2:00' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('cambiar el objetivo de descanso lo deja marcado', async () => {
    const user = userEvent.setup();
    renderApp({ path: '/session', session, setup: serveActiveSession });

    const rest = within(await screen.findByRole('region', { name: 'Descanso' }));
    await user.click(rest.getByRole('button', { name: '3:00' }));

    expect(rest.getByRole('button', { name: '3:00' })).toHaveAttribute('aria-pressed', 'true');
    expect(rest.getByRole('button', { name: '2:00' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('registra una serie con el peso habitual precargado y celebra la marca', async () => {
    const user = userEvent.setup();
    let current = activeSession;
    const { fake } = renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        fake.on('GET', '/sessions/active', () => jsonResponse({ session: current }));
        fake.on('GET', '/exercises', () => jsonResponse([benchPress, squat]));
        fake.on('POST', `/sessions/${activeSession.id}/sets`, (request) => {
          const body = request.body as LogSetRequest;
          const entry = {
            id: body.id,
            trackedExerciseId: body.trackedExerciseId,
            orderIndex: current.sets.length,
            weight: body.weight,
            reps: body.reps,
            rpe: body.rpe ?? null,
            isWarmup: body.isWarmup ?? false,
            completedAt: '2026-09-08T18:30:00.000Z',
            source: body.source,
          };
          current = { ...current, sets: [...current.sets, entry] };
          return jsonResponse({ set: entry, records: [newMaxWeightRecord] });
        });
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Registrar serie' }));

    // El peso habitual del ejercicio elegido, ya puesto: entre series no se teclea nada.
    expect(screen.getByRole('combobox', { name: 'Ejercicio' })).toHaveValue(benchPress.id);
    expect(screen.getByLabelText('Peso')).toHaveValue('82.5');
    expect(screen.getByLabelText('Repeticiones')).toHaveValue('8');

    await user.click(screen.getAllByRole('button', { name: 'Registrar serie' })[1] as HTMLElement);

    expect(await screen.findByText('1 marca nueva')).toBeInTheDocument();
    expect(screen.getByText('Peso máximo: 90 kg')).toBeInTheDocument();

    // La serie aparece en la lista: registrarla invalida la sesión y se relee.
    await waitFor(() => {
      expect(screen.getAllByText('82,5 kg × 8')).toHaveLength(2);
    });

    const logged = fake.requests.find((request) => request.path.endsWith('/sets'));
    const body = logged?.body as LogSetRequest;
    expect(body.trackedExerciseId).toBe(benchPress.id);
    expect(body.weight).toBe('82.50');
    expect(body.reps).toBe(8);
    expect(body.rpe).toBeNull();
    expect(body.isWarmup).toBe(false);
    expect(body.source).toBe('web');
    expect(body.id).toMatch(UUID);
  });

  it('cambiar de ejercicio recarga su peso habitual y no arrastra el anterior', async () => {
    const user = userEvent.setup();
    renderApp({ path: '/session', session, setup: serveActiveSession });

    await user.click(await screen.findByRole('button', { name: 'Registrar serie' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Ejercicio' }), squat.id);

    expect(screen.getByLabelText('Peso')).toHaveValue('100');
    expect(screen.getByLabelText('Repeticiones')).toHaveValue('5');
  });

  it('llegar desde la ficha de un ejercicio abre la hoja con él elegido', async () => {
    renderApp({ path: `/session?exercise=${squat.id}`, session, setup: serveActiveSession });

    expect(await screen.findByRole('combobox', { name: 'Ejercicio' })).toHaveValue(squat.id);
    expect(screen.getByLabelText('Peso')).toHaveValue('100');
  });

  it('sin ejercicios seguidos la hoja lo dice en vez de quedarse en blanco', async () => {
    const user = userEvent.setup();
    renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        fake.on('GET', '/sessions/active', () => jsonResponse({ session: activeSession }));
        fake.on('GET', '/exercises', () => jsonResponse([]));
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Registrar serie' }));

    expect(screen.getByText('Todavía no sigues ningún ejercicio')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Ejercicio' })).not.toBeInTheDocument();
  });

  it('un fallo al registrar se ve dentro de la hoja', async () => {
    const user = userEvent.setup();
    renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        serveActiveSession(fake);
        fake.on('POST', `/sessions/${activeSession.id}/sets`, () =>
          errorResponse('conflicting_write', 409, 'Esa serie ya existe con otros datos'),
        );
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Registrar serie' }));
    await user.click(screen.getAllByRole('button', { name: 'Registrar serie' })[1] as HTMLElement);

    expect(await screen.findByText('No se pudo registrar')).toBeInTheDocument();
    expect(screen.getByText('Esa serie ya existe con otros datos')).toBeInTheDocument();
  });
});

describe('sesión: terminarla', () => {
  it('resume lo hecho, la cierra y vuelve a Hoy', async () => {
    const user = userEvent.setup();
    let ended = false;
    const { fake } = renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        fake.on('GET', '/sessions/active', () =>
          jsonResponse({ session: ended ? null : activeSession }),
        );
        fake.on('GET', '/exercises', () => jsonResponse([benchPress, squat]));
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
        fake.on('POST', `/sessions/${activeSession.id}/end`, () => {
          ended = true;
          return jsonResponse({
            id: activeSession.id,
            startedAt: activeSession.startedAt,
            endedAt: '2026-09-08T19:00:00.000Z',
            notes: 'Buen día',
            source: 'web',
          });
        });
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Terminar sesión' }));

    // El resumen sale antes de cerrar nada: 82,5 kg × 8 son 660 kg de volumen.
    expect(screen.getByText('Volumen')).toBeInTheDocument();
    expect(screen.getByText('660 kg')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Notas de la sesión' }), 'Buen día');
    await user.click(screen.getAllByRole('button', { name: 'Terminar sesión' })[1] as HTMLElement);

    expect(await screen.findByRole('heading', { name: /Hola/ })).toBeInTheDocument();
    const end = fake.requests.find((request) => request.path.endsWith('/end'));
    expect(end?.body).toEqual({ notes: 'Buen día' });
  });

  it('una sesión sin series avisa de que se cierra vacía', async () => {
    const user = userEvent.setup();
    renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        serveActiveSession(fake, { ...activeSession, sets: [] });
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Terminar sesión' }));

    expect(screen.getByText('Sesión sin series')).toBeInTheDocument();
  });
});

describe('corregir una serie desde la sesión', () => {
  const loggedSet = activeSession.sets[0];

  it('la fila abre la hoja con lo que se registró', async () => {
    const user = userEvent.setup();
    renderApp({ path: '/session', session, setup: serveActiveSession });

    await user.click(await screen.findByRole('button', { name: /82,5 kg × 8/ }));

    expect(screen.getByRole('heading', { name: /Corregir serie · Press de banca/ })).toBeVisible();
    expect(screen.getByLabelText('Peso')).toHaveValue('82.5');
    expect(screen.getByLabelText('Repeticiones')).toHaveValue('8');
  });

  it('corrige el peso y manda solo la serie tocada', async () => {
    const user = userEvent.setup();
    let current = activeSession;
    const { fake } = renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        fake.on('GET', '/sessions/active', () => jsonResponse({ session: current }));
        fake.on('GET', '/exercises', () => jsonResponse([benchPress, squat]));
        fake.on('PATCH', `/sessions/${activeSession.id}/sets/${loggedSet?.id ?? ''}`, (request) => {
          const body = request.body as UpdateSetRequest;
          const corrected = { ...(loggedSet as SetEntry), weight: body.weight ?? '0.00' };
          current = { ...current, sets: [corrected] };
          return jsonResponse({ set: corrected, records: [] });
        });
      },
    });

    await user.click(await screen.findByRole('button', { name: /82,5 kg × 8/ }));
    await user.clear(screen.getByLabelText('Peso'));
    await user.type(screen.getByLabelText('Peso'), '80');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    // La lista se relee al invalidar: la corrección se ve sin recargar la pantalla.
    expect(await screen.findByRole('button', { name: /80 kg × 8/ })).toBeInTheDocument();

    const patch = fake.requests.find((request) => request.method === 'PATCH');
    expect(patch?.body).toEqual({ weight: '80.00', reps: 8, rpe: null, isWarmup: false });
  });

  it('corregir al alza celebra la marca igual que registrarla', async () => {
    const user = userEvent.setup();
    renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        serveActiveSession(fake);
        fake.on('PATCH', `/sessions/${activeSession.id}/sets/${loggedSet?.id ?? ''}`, () =>
          jsonResponse({ set: loggedSet, records: [newMaxWeightRecord] }),
        );
      },
    });

    await user.click(await screen.findByRole('button', { name: /82,5 kg × 8/ }));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText('1 marca nueva')).toBeInTheDocument();
    expect(screen.getByText('Peso máximo: 90 kg')).toBeInTheDocument();
  });

  it('borra la serie y la sesión se queda sin ella', async () => {
    const user = userEvent.setup();
    let current = activeSession;
    const { fake } = renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        fake.on('GET', '/sessions/active', () => jsonResponse({ session: current }));
        fake.on('GET', '/exercises', () => jsonResponse([benchPress, squat]));
        fake.on('DELETE', `/sessions/${activeSession.id}/sets/${loggedSet?.id ?? ''}`, () => {
          current = { ...current, sets: [] };
          return new Response(null, { status: 204 });
        });
      },
    });

    await user.click(await screen.findByRole('button', { name: /82,5 kg × 8/ }));
    await user.click(screen.getByRole('button', { name: 'Borrar serie' }));

    expect(await screen.findByText('Todavía no has registrado ninguna serie')).toBeInTheDocument();
    expect(fake.requests.some((request) => request.method === 'DELETE')).toBe(true);
  });

  it('una sesión que se cerró por otro lado lo dice en vez de tragárselo', async () => {
    const user = userEvent.setup();
    renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        serveActiveSession(fake);
        fake.on('PATCH', `/sessions/${activeSession.id}/sets/${loggedSet?.id ?? ''}`, () =>
          errorResponse('session_closed', 409, 'Esa sesión ya está cerrada'),
        );
      },
    });

    await user.click(await screen.findByRole('button', { name: /82,5 kg × 8/ }));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText('No se pudo corregir')).toBeInTheDocument();
  });
});

describe('Hoy enlaza con la sesión', () => {
  it('sin ninguna abierta invita a empezar', async () => {
    renderHome(null);

    expect(await screen.findByRole('link', { name: 'Empezar a entrenar' })).toHaveAttribute(
      'href',
      '/session',
    );
  });

  it('con una abierta lleva a seguirla', async () => {
    renderHome(activeSession.id);

    expect(await screen.findByRole('link', { name: 'Seguir' })).toHaveAttribute('href', '/session');
  });
});

function renderHome(activeSessionId: string | null): void {
  renderApp({
    path: '/',
    session,
    setup: (fake) => {
      fake.on('GET', '/stats/signals', () => jsonResponse({ ...signals, activeSessionId }));
    },
  });
}
