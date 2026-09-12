import { sessionSchema } from '@gymbuddy/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SESSION_STORAGE_KEY } from '../../src/auth/session-store';
import { errorResponse, jsonResponse, withSessionRefresh } from '../fake-fetch';
import { benchPress, session, signals, weeklyCalendar } from '../fixtures';
import { renderApp } from './render-app';

/** Lo que manda el Worker cuando al token de la sesión le queda menos de la mitad de vida. */
const renewed = { token: 'jwt-renovado', expiresAt: '2099-06-01T00:00:00.000Z' };

/** La sesión tal y como quedó guardada en el dispositivo. */
function storedSession(storage: { getItem: (key: string) => string | null }) {
  const raw = storage.getItem(SESSION_STORAGE_KEY);

  return raw === null ? null : sessionSchema.parse(JSON.parse(raw));
}

describe('la sesión se renueva sola al usarse', () => {
  it('guarda el token nuevo que llega en una respuesta cualquiera', async () => {
    const { storage, fake } = renderApp({
      path: '/',
      session,
      setup: (fake) => {
        fake.on('GET', '/stats/signals', () => withSessionRefresh(jsonResponse(signals), renewed));
        fake.on('GET', '/stats/week', () => jsonResponse(weeklyCalendar));
      },
    });

    await screen.findByRole('heading', { name: 'Hola, Juan' });
    await waitFor(() => {
      expect(storedSession(storage)?.token).toBe(renewed.token);
    });
    // Es la misma cuenta: el usuario no viaja en las cabeceras y no se pierde.
    expect(storedSession(storage)?.user).toEqual(session.user);
    expect(storedSession(storage)?.expiresAt).toBe(renewed.expiresAt);
    // El cliente se rehace con el token nuevo, pero la caché sigue en pie: si se vaciara, la
    // pantalla montada volvería a pedir lo mismo al instante.
    expect(
      fake.requests.filter((request) => request.path.startsWith('/stats/signals')),
    ).toHaveLength(1);
  });

  it('las peticiones siguientes ya salen con el token nuevo', async () => {
    const user = userEvent.setup();
    const { fake } = renderApp({
      path: '/',
      session,
      setup: (fixture) => {
        fixture.on('GET', '/stats/signals', () =>
          withSessionRefresh(jsonResponse(signals), renewed),
        );
        fixture.on('GET', '/stats/week', () => jsonResponse(weeklyCalendar));
        fixture.on('GET', '/exercises', () => jsonResponse([benchPress]));
      },
    });

    await screen.findByRole('heading', { name: 'Hola, Juan' });
    await user.click(screen.getByRole('link', { name: 'Ejercicios' }));
    await screen.findByRole('heading', { name: 'Mis ejercicios' });

    const exercises = fake.requests.filter((request) => request.path.startsWith('/exercises'));
    expect(exercises).not.toHaveLength(0);
    for (const request of exercises) {
      expect(request.headers.get('Authorization')).toBe(`Bearer ${renewed.token}`);
    }
  });

  it('no resucita una sesión que acaba de cerrarse', async () => {
    const { storage } = renderApp({
      path: '/',
      session,
      setup: (fake) => {
        // La respuesta llega con un token nuevo y, a la vez, dice que la sesión no vale: el 401
        // manda, porque guardar el token de una sesión cerrada dejaría la app en tierra de nadie.
        fake.on('GET', '/stats/signals', () =>
          withSessionRefresh(errorResponse('unauthorized', 401, 'Sin sesión'), renewed),
        );
      },
    });

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(storage.data.has(SESSION_STORAGE_KEY)).toBe(false);
  });
});
