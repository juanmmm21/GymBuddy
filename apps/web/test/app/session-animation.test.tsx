import type { LogStrengthSetRequest, WorkoutSessionDetail } from '@gymbuddy/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { jsonResponse, type FakeFetch } from '../fake-fetch';
import { activeSession, benchPress, session, squat } from '../fixtures';
import { renderApp } from './render-app';

/** Las filas de series de la pantalla, en el orden en que se pintan. */
function setRows(): HTMLElement[] {
  return screen.getAllByRole('button').filter((button) => button.hasAttribute('data-fresh'));
}

/** Cuáles de ellas han entrado resaltadas. */
function freshValues(): string[] {
  return setRows().map((row) => row.getAttribute('data-fresh') ?? '');
}

/** La barra del descanso: lo que le queda, entre 1 (llena) y 0 (cumplido). */
function restBarScale(): string {
  const track = screen.getByRole('progressbar');
  const fill = track.firstElementChild as HTMLElement;
  return fill.style.transform;
}

/** Un Worker que acepta series y las va sumando a la sesión abierta. */
function serveSession(fake: FakeFetch, current: WorkoutSessionDetail): void {
  let latest = current;
  fake.on('GET', '/sessions/active', () => jsonResponse({ session: latest }));
  fake.on('GET', '/exercises', () => jsonResponse([benchPress, squat]));
  fake.on('POST', `/sessions/${current.id}/sets`, (request) => {
    const body = request.body as LogStrengthSetRequest;
    const entry = {
      id: body.id,
      trackedExerciseId: body.trackedExerciseId,
      kind: 'strength' as const,
      orderIndex: latest.sets.length,
      weight: body.weight,
      reps: body.reps,
      rpe: body.rpe ?? null,
      isWarmup: body.isWarmup ?? false,
      completedAt: new Date().toISOString(),
    };
    latest = { ...latest, sets: [...latest.sets, entry] };
    return jsonResponse({ set: entry, records: [] });
  });
}

describe('la serie recién apuntada', () => {
  it('lo que ya estaba hecho al abrir la sesión no entra resaltado', async () => {
    renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        serveSession(fake, activeSession);
      },
    });

    await screen.findByRole('heading', { name: 'Press de banca' });
    expect(freshValues()).toEqual(['false']);
  });

  it('la que se acaba de registrar se resalta, y solo ella', async () => {
    const actor = userEvent.setup();
    renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        serveSession(fake, activeSession);
      },
    });
    await screen.findByRole('heading', { name: 'Press de banca' });

    await actor.click(screen.getByRole('button', { name: 'Registrar serie' }));
    await actor.click(screen.getAllByRole('button', { name: 'Registrar serie' })[1] as HTMLElement);

    await waitFor(() => {
      expect(freshValues()).toEqual(['false', 'true']);
    });
  });
});

describe('la barra del descanso', () => {
  it('enseña lo que queda y se vacía del todo al cumplirse el objetivo', async () => {
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const [first] = activeSession.sets;
    if (first === undefined) throw new Error('la sesión de prueba necesita una serie');
    const resting: WorkoutSessionDetail = {
      ...activeSession,
      sets: [{ ...first, completedAt: oneMinuteAgo }],
    };
    renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        serveSession(fake, resting);
      },
    });

    const rest = within(await screen.findByRole('region', { name: 'Descanso' }));
    // Un minuto descansado de los dos de objetivo: media barra sin gastar.
    expect(rest.getByRole('timer')).toHaveTextContent('1:00');
    expect(restBarScale()).toBe('scaleX(0.5)');

    // Con el objetivo más corto ya está cumplido, y no queda barra.
    await userEvent.setup().click(rest.getByRole('button', { name: '1:00' }));
    await waitFor(() => {
      expect(restBarScale()).toBe('scaleX(0)');
    });
    expect(rest.getByText(/Descanso cumplido/)).toBeInTheDocument();
  });
});
