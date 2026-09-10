import type {
  LogSetRequest,
  Routine,
  SetEntry,
  StartSessionRequest,
  TrackedExercise,
  WorkoutSessionDetail,
} from '@gymbuddy/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SESSION_ROUTINE_STORAGE_KEY } from '../../src/features/session/session-routine-store';
import { errorResponse, jsonResponse, type FakeFetch } from '../fake-fetch';
import {
  activeSession,
  archivedLegRoutine,
  benchPress,
  pastSession,
  pushRoutine,
  session,
  signals,
  squat,
  weeklyCalendar,
} from '../fixtures';
import { renderApp } from './render-app';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const GUIDED_PATH = `/session?routine=${pushRoutine.id}`;
const MISSING_ROUTINE_ID = '0e1f2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a4b';

interface WorkerOptions {
  readonly session: WorkoutSessionDetail | null;
  readonly routines?: readonly Routine[];
  readonly exercises?: readonly TrackedExercise[];
}

/**
 * Un Worker en memoria con todo lo que toca una sesión guiada: la sesión (que se abre,
 * crece con cada serie y se cierra), los ejercicios, las rutinas y lo que pide Hoy.
 */
function serveWorker(fake: FakeFetch, options: WorkerOptions): void {
  let current = options.session;

  fake.on('GET', '/sessions/active', () => jsonResponse({ session: current }));
  fake.on('GET', '/exercises', () => jsonResponse(options.exercises ?? [benchPress, squat]));
  fake.on('GET', '/routines', () => jsonResponse(options.routines ?? [pushRoutine]));
  fake.on('GET', '/stats/signals', () =>
    jsonResponse({ ...signals, activeSessionId: current?.id ?? null }),
  );
  fake.on('GET', '/stats/week', () => jsonResponse(weeklyCalendar));

  fake.on('POST', '/sessions', (request) => {
    const body = request.body as StartSessionRequest;
    current = {
      id: body.id,
      startedAt: '2026-09-08T18:00:00.000Z',
      endedAt: null,
      notes: null,
      source: body.source,
      sets: [],
    };
    return jsonResponse({ ...current, sets: undefined });
  });

  const opened = options.session;
  if (opened === null) return;

  fake.on('POST', `/sessions/${opened.id}/sets`, (request) => {
    if (current === null) return errorResponse('session_closed', 409, 'Esa sesión está cerrada');
    const body = request.body as LogSetRequest;
    const entry: SetEntry = {
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
    return jsonResponse({ set: entry, records: [] });
  });

  fake.on('POST', `/sessions/${opened.id}/end`, () => {
    current = null;
    return jsonResponse({
      id: opened.id,
      startedAt: opened.startedAt,
      endedAt: '2026-09-08T19:00:00.000Z',
      notes: null,
      source: opened.source,
    });
  });
}

/** Series efectivas de un ejercicio, con su orden a partir de `offset`. */
function workingSets(trackedExerciseId: string, count: number, offset: number): SetEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `40000000-0000-4000-8000-${String(offset + index).padStart(12, '0')}`,
    trackedExerciseId,
    orderIndex: offset + index,
    weight: '80.00',
    reps: 6,
    rpe: null,
    isWarmup: false,
    completedAt: '2026-09-08T18:20:00.000Z',
    source: 'web' as const,
  }));
}

function linkToRoutine(routineId: string): string {
  return JSON.stringify({ sessionId: activeSession.id, routineId });
}

describe('sesión guiada por una rutina: entrar', () => {
  it('«Empezar esta rutina» en el editor lleva a la sesión con esa rutina', async () => {
    const user = userEvent.setup();
    renderApp({
      path: `/routines/${pushRoutine.id}`,
      session,
      setup: (fake) => {
        serveWorker(fake, { session: null });
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Empezar esta rutina' }));

    expect(await screen.findByText('Vas a empezar «Empuje»')).toBeInTheDocument();
    expect(screen.getByText(/2 ejercicios · 7 series/)).toBeInTheDocument();
  });

  it('una rutina sin ejercicios no se puede empezar', async () => {
    renderApp({
      path: `/routines/${pushRoutine.id}`,
      session,
      setup: (fake) => {
        serveWorker(fake, { session: null, routines: [{ ...pushRoutine, items: [] }] });
      },
    });

    expect(await screen.findByRole('button', { name: 'Empezar esta rutina' })).toBeDisabled();
  });

  it('empieza la sesión recordando la rutina y pinta su guion', async () => {
    const user = userEvent.setup();
    const { fake, storage } = renderApp({
      path: GUIDED_PATH,
      session,
      setup: (fake) => {
        serveWorker(fake, { session: null });
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Empezar a entrenar' }));

    const guide = await screen.findByRole('list', { name: 'Guion de la rutina' });
    expect(
      within(guide).getByRole('button', { name: 'Registrar Press de banca, 0 de 4 series' }),
    ).toHaveAttribute('aria-current', 'step');
    expect(
      within(guide).getByRole('button', { name: 'Registrar Sentadilla con barra, 0 de 3 series' }),
    ).not.toHaveAttribute('aria-current');
    expect(screen.getByText('0 de 2 hechos')).toBeInTheDocument();

    const post = fake.requests.find((request) => request.path === '/sessions');
    const body = post?.body as StartSessionRequest;
    expect(body.id).toMatch(UUID);
    expect(JSON.parse(storage.data.get(SESSION_ROUTINE_STORAGE_KEY) ?? 'null')).toEqual({
      sessionId: body.id,
      routineId: pushRoutine.id,
    });
  });

  it('con una sesión ya abierta la guía en vez de abrir otra', async () => {
    const { fake } = renderApp({
      path: GUIDED_PATH,
      session,
      setup: (fake) => {
        serveWorker(fake, { session: activeSession });
      },
    });

    expect(
      await screen.findByRole('button', { name: 'Registrar Press de banca, 1 de 4 series' }),
    ).toHaveAttribute('aria-current', 'step');
    expect(fake.requests.some((request) => request.method === 'POST')).toBe(false);
  });

  it('una rutina que no está avisa y deja empezar igualmente, sin recordarla', async () => {
    const user = userEvent.setup();
    const { storage } = renderApp({
      path: `/session?routine=${MISSING_ROUTINE_ID}`,
      session,
      setup: (fake) => {
        serveWorker(fake, { session: null });
      },
    });

    expect(await screen.findByText('No encontramos esa rutina')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Empezar a entrenar' }));

    expect(await screen.findByText('No encontramos la rutina de esta sesión')).toBeInTheDocument();
    expect(storage.data.has(SESSION_ROUTINE_STORAGE_KEY)).toBe(false);
  });
});

describe('sesión guiada por una rutina: seguir el guion', () => {
  it('«Registrar serie» abre con la línea que toca y dice el objetivo de la rutina', async () => {
    const user = userEvent.setup();
    renderApp({
      path: GUIDED_PATH,
      session,
      setup: (fake) => {
        serveWorker(fake, { session: activeSession });
      },
    });

    await screen.findByRole('list', { name: 'Guion de la rutina' });
    await user.click(screen.getByRole('button', { name: 'Registrar serie' }));

    expect(screen.getByRole('combobox', { name: 'Ejercicio' })).toHaveValue(benchPress.id);
    expect(screen.getByText('Rutina: 6–8 reps · serie 2 de 4')).toBeInTheDocument();

    // Cambiar de ejercicio cambia también el objetivo que se lee.
    await user.selectOptions(screen.getByRole('combobox', { name: 'Ejercicio' }), squat.id);
    expect(screen.getByText('Rutina: 5 reps · serie 1 de 3')).toBeInTheDocument();
  });

  it('tocar una línea abre su ejercicio, y la serie registrada suma en esa línea', async () => {
    const user = userEvent.setup();
    const { fake } = renderApp({
      path: GUIDED_PATH,
      session,
      setup: (fake) => {
        serveWorker(fake, { session: activeSession });
      },
    });

    await user.click(
      await screen.findByRole('button', { name: 'Registrar Sentadilla con barra, 0 de 3 series' }),
    );
    expect(screen.getByRole('combobox', { name: 'Ejercicio' })).toHaveValue(squat.id);
    expect(screen.getByLabelText('Peso')).toHaveValue('100');

    await user.click(screen.getAllByRole('button', { name: 'Registrar serie' })[1] as HTMLElement);

    // Sigue tocando la sentadilla aunque la banca esté a medias: es lo que se está haciendo.
    const current = await screen.findByRole('button', {
      name: 'Registrar Sentadilla con barra, 1 de 3 series',
    });
    expect(current).toHaveAttribute('aria-current', 'step');

    const logged = fake.requests.find((request) => request.path.endsWith('/sets'));
    expect((logged?.body as LogSetRequest).trackedExerciseId).toBe(squat.id);
  });

  it('un ejercicio archivado que nombra la rutina se registra desde su línea', async () => {
    const user = userEvent.setup();
    const archivedSquat = { ...squat, archivedAt: '2026-09-08T12:00:00.000Z' };
    renderApp({
      path: GUIDED_PATH,
      session,
      setup: (fake) => {
        serveWorker(fake, { session: activeSession, exercises: [benchPress, archivedSquat] });
      },
    });

    await user.click(
      await screen.findByRole('button', { name: 'Registrar Sentadilla con barra, 0 de 3 series' }),
    );

    const select = screen.getByRole('combobox', { name: 'Ejercicio' });
    expect(select).toHaveValue(squat.id);
    expect(
      within(select).getByRole('option', { name: 'Sentadilla con barra (archivado)' }),
    ).toBeInTheDocument();
  });

  it('con todas las líneas hechas celebra la rutina completada', async () => {
    const done = {
      ...activeSession,
      sets: [...workingSets(benchPress.id, 4, 0), ...workingSets(squat.id, 3, 4)],
    };
    renderApp({
      path: GUIDED_PATH,
      session,
      setup: (fake) => {
        serveWorker(fake, { session: done });
      },
    });

    expect(await screen.findByText('Rutina completada')).toBeInTheDocument();
    expect(screen.getByText('2 de 2 hechos')).toBeInTheDocument();
    expect(screen.queryByRole('button', { current: 'step' })).not.toBeInTheDocument();
  });

  it('el calentamiento no avanza el guion', async () => {
    const warmup = {
      ...activeSession,
      sets: [{ ...workingSets(squat.id, 1, 1)[0], isWarmup: true }],
    };
    renderApp({
      path: GUIDED_PATH,
      session,
      setup: (fake) => {
        serveWorker(fake, { session: warmup as WorkoutSessionDetail });
      },
    });

    expect(
      await screen.findByRole('button', { name: 'Registrar Sentadilla con barra, 0 de 3 series' }),
    ).toBeInTheDocument();
  });
});

describe('sesión guiada por una rutina: recordarla', () => {
  it('salir a Hoy y volver por «Seguir» mantiene el guion', async () => {
    const user = userEvent.setup();
    renderApp({
      path: GUIDED_PATH,
      session,
      setup: (fake) => {
        serveWorker(fake, { session: activeSession });
      },
    });

    await user.click(
      await screen.findByRole('button', { name: 'Registrar Sentadilla con barra, 0 de 3 series' }),
    );
    await user.click(screen.getAllByRole('button', { name: 'Registrar serie' })[1] as HTMLElement);
    await screen.findByRole('button', { name: 'Registrar Sentadilla con barra, 1 de 3 series' });

    await user.click(screen.getAllByRole('link', { name: /Hoy/ })[0] as HTMLElement);
    await user.click(await screen.findByRole('link', { name: 'Seguir' }));

    expect(
      await screen.findByRole('button', { name: 'Registrar Sentadilla con barra, 1 de 3 series' }),
    ).toHaveAttribute('aria-current', 'step');
  });

  it('lo recordado para otra sesión no guía la abierta, y no se piden las rutinas', async () => {
    const { fake } = renderApp({
      path: '/session',
      session,
      stored: {
        [SESSION_ROUTINE_STORAGE_KEY]: JSON.stringify({
          sessionId: pastSession.id,
          routineId: pushRoutine.id,
        }),
      },
      setup: (fake) => {
        serveWorker(fake, { session: activeSession });
      },
    });

    expect(await screen.findByRole('heading', { name: 'Press de banca' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Guion de la rutina' })).not.toBeInTheDocument();
    expect(fake.requests.some((request) => request.path.startsWith('/routines'))).toBe(false);
  });

  it('terminar la sesión olvida la rutina', async () => {
    const user = userEvent.setup();
    const { storage } = renderApp({
      path: '/session',
      session,
      stored: { [SESSION_ROUTINE_STORAGE_KEY]: linkToRoutine(pushRoutine.id) },
      setup: (fake) => {
        serveWorker(fake, { session: activeSession });
      },
    });

    await screen.findByRole('list', { name: 'Guion de la rutina' });
    await user.click(screen.getByRole('button', { name: 'Terminar sesión' }));
    await user.click(screen.getAllByRole('button', { name: 'Terminar sesión' })[1] as HTMLElement);

    expect(await screen.findByRole('heading', { name: /Hola/ })).toBeInTheDocument();
    expect(storage.data.has(SESSION_ROUTINE_STORAGE_KEY)).toBe(false);
  });
});

describe('Hoy: rutinas de un toque', () => {
  const emptyRoutine: Routine = {
    ...pushRoutine,
    id: '9e0f1a2b-3c4d-4e5f-8a6b-7c8d9e0f1a2b',
    name: 'Vacía',
    items: [],
  };

  it('ofrece las activas con ejercicios, cada una llevando a su sesión', async () => {
    renderApp({
      path: '/',
      session,
      setup: (fake) => {
        serveWorker(fake, {
          session: null,
          routines: [pushRoutine, archivedLegRoutine, emptyRoutine],
        });
      },
    });

    const shortcuts = await screen.findByRole('region', { name: 'O empieza una rutina' });
    expect(within(shortcuts).getByRole('link', { name: /Empuje/ })).toHaveAttribute(
      'href',
      GUIDED_PATH,
    );
    expect(within(shortcuts).getAllByRole('link')).toHaveLength(1);
  });

  it('también antes de haber entrenado nunca', async () => {
    renderApp({
      path: '/',
      session,
      setup: (fake) => {
        serveWorker(fake, { session: null });
        fake.on('GET', '/stats/signals', () =>
          jsonResponse({
            ...signals,
            activeSessionId: null,
            lastSessionAt: null,
            daysSinceLastSession: null,
            latestRecord: null,
          }),
        );
      },
    });

    expect(await screen.findByText('Todavía no has entrenado')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Empuje/ })).toHaveAttribute(
      'href',
      GUIDED_PATH,
    );
  });

  it('con una sesión abierta no las ofrece: se sigue la que hay', async () => {
    const { fake } = renderApp({
      path: '/',
      session,
      setup: (fake) => {
        serveWorker(fake, { session: activeSession });
      },
    });

    expect(await screen.findByRole('link', { name: 'Seguir' })).toBeInTheDocument();
    await waitFor(() => {
      expect(fake.requests.some((request) => request.path.startsWith('/stats/week'))).toBe(true);
    });
    expect(screen.queryByText('O empieza una rutina')).not.toBeInTheDocument();
    expect(fake.requests.some((request) => request.path.startsWith('/routines'))).toBe(false);
  });
});
