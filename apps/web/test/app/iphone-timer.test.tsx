import type { WorkoutSessionDetail } from '@gymbuddy/shared';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { jsonResponse, type FakeFetch } from '../fake-fetch';
import { activeSession, benchPress, session, signals, squat } from '../fixtures';
import { installSupport, USER_AGENTS } from '../install-fixtures';
import { IPHONE_TIMER_STORAGE_KEY } from '../../src/features/session/iphone-timer';
import { renderApp } from './render-app';

const ENABLED = { [IPHONE_TIMER_STORAGE_KEY]: JSON.stringify({ enabled: true }) };

/** La sesión de las fixtures con su serie registrada hace treinta segundos: descanso en marcha. */
function serveRestingSession(fake: FakeFetch): void {
  const [firstSet] = activeSession.sets;
  if (firstSet === undefined) throw new Error('La sesión de las fixtures trae una serie');
  const current: WorkoutSessionDetail = {
    ...activeSession,
    sets: [{ ...firstSet, completedAt: new Date(Date.now() - 30_000).toISOString() }],
  };
  fake.on('GET', '/sessions/active', () => jsonResponse({ session: current }));
  fake.on('GET', '/exercises', () => jsonResponse([benchPress, squat]));
}

describe('temporizador del iPhone en Ajustes', () => {
  it('en un iPhone se enciende, se recuerda y enseña cómo crear el Atajo', async () => {
    const user = userEvent.setup();
    const { storage } = renderApp({
      path: '/settings',
      session,
      install: installSupport(USER_AGENTS.iphoneSafari),
      setup: (fake) => {
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
      },
    });

    const toggle = await screen.findByRole('switch', { name: 'Temporizador del iPhone' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByText('GymBuddy descanso')).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(storage.data.get(IPHONE_TIMER_STORAGE_KEY)).toBe(JSON.stringify({ enabled: true }));
    // El nombre exacto del Atajo, que es lo que busca el enlace.
    expect(screen.getByText('GymBuddy descanso')).toBeInTheDocument();
  });

  it('fuera de iOS no se ofrece: no hay app Atajos', async () => {
    renderApp({
      path: '/settings',
      session,
      setup: (fake) => {
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
      },
    });

    expect(await screen.findByRole('heading', { name: 'Ajustes' })).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Temporizador del iPhone' })).toBeNull();
  });
});

describe('temporizador del iPhone en el descanso', () => {
  it('encendido, el descanso lleva un enlace al Atajo con lo que queda', async () => {
    renderApp({
      path: '/session',
      session,
      stored: ENABLED,
      install: installSupport(USER_AGENTS.iphoneSafari),
      setup: serveRestingSession,
    });

    const rest = within(await screen.findByRole('region', { name: 'Descanso' }));
    const link = rest.getByRole('link', { name: /^Temporizador del iPhone/ });
    // Treinta segundos de dos minutos: quedan noventa (u ochenta y nueve si el segundo cambió).
    expect(link.getAttribute('href')).toMatch(
      /^shortcuts:\/\/run-shortcut\?name=GymBuddy%20descanso&input=text&text=(90|89)$/,
    );
  });

  it('apagado, en otro móvil o con el descanso cumplido no sale', async () => {
    renderApp({
      path: '/session',
      session,
      install: installSupport(USER_AGENTS.iphoneSafari),
      setup: serveRestingSession,
    });
    const off = within(await screen.findByRole('region', { name: 'Descanso' }));
    expect(off.queryByRole('link', { name: /Temporizador del iPhone/ })).toBeNull();
    cleanup();

    renderApp({ path: '/session', session, stored: ENABLED, setup: serveRestingSession });
    const desktop = within(await screen.findByRole('region', { name: 'Descanso' }));
    expect(desktop.queryByRole('link', { name: /Temporizador del iPhone/ })).toBeNull();
    cleanup();

    // La serie de las fixtures es de hace cinco minutos: el descanso ya se cumplió.
    renderApp({
      path: '/session',
      session,
      stored: ENABLED,
      install: installSupport(USER_AGENTS.iphoneSafari),
      setup: (fake) => {
        fake.on('GET', '/sessions/active', () => jsonResponse({ session: activeSession }));
        fake.on('GET', '/exercises', () => jsonResponse([benchPress, squat]));
      },
    });
    const done = within(await screen.findByRole('region', { name: 'Descanso' }));
    expect(done.getByText(/Descanso cumplido/)).toBeInTheDocument();
    expect(done.queryByRole('link', { name: /Temporizador del iPhone/ })).toBeNull();
  });
});
