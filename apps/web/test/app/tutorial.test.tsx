import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { TUTORIAL_STORAGE_KEY } from '../../src/features/tutorial/tutorial';
import { jsonResponse } from '../fake-fetch';
import { activeSession, benchPress, session, signals } from '../fixtures';
import { renderApp } from './render-app';

const DIALOG_NAME = 'Cómo se usa GymBuddy';

/** La primera vez de verdad: el dispositivo no recuerda haberlo visto. */
function renderFirstTime(open: typeof activeSession | null = null) {
  return renderApp({
    path: '/',
    session,
    // Explícito: `renderApp` solo da el tutorial por visto cuando el test no dice nada.
    stored: { [TUTORIAL_STORAGE_KEY]: '{"seen":false}' },
    setup: (fake) => {
      fake.on('GET', '/stats/signals', () => jsonResponse(signals));
      fake.on('GET', '/sessions/active', () => jsonResponse({ session: open }));
      fake.on('GET', '/exercises', () => jsonResponse([benchPress]));
      fake.on('GET', '/routines', () => jsonResponse([]));
    },
  });
}

describe('tutorial de la primera vez', () => {
  it('se pone delante al abrir la app por primera vez, por el primer paso', async () => {
    renderFirstTime();

    const dialog = await screen.findByRole('dialog', { name: DIALOG_NAME });
    expect(dialog).toHaveTextContent('Paso 1 de 5');
    expect(await screen.findByRole('heading', { name: 'Hoy', level: 2 })).toBeInTheDocument();
    // En el primero no hay a dónde volver.
    expect(screen.queryByRole('button', { name: 'Atrás' })).not.toBeInTheDocument();
  });

  it('avanza y retrocede por los cinco pasos, y el último cierra', async () => {
    const user = userEvent.setup();
    const { storage } = renderFirstTime();

    await screen.findByRole('dialog', { name: DIALOG_NAME });
    for (const title of ['Registrar una serie', 'Rutinas', 'Catálogo']) {
      await user.click(screen.getByRole('button', { name: 'Siguiente' }));
      expect(screen.getByRole('heading', { name: title, level: 2 })).toBeInTheDocument();
    }

    await user.click(screen.getByRole('button', { name: 'Atrás' }));
    expect(screen.getByRole('heading', { name: 'Rutinas', level: 2 })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(
      screen.getByRole('heading', { name: 'Ajustes y sin cobertura', level: 2 }),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Siguiente' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Empezar' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: DIALOG_NAME })).not.toBeInTheDocument(),
    );
    expect(storage.data.get(TUTORIAL_STORAGE_KEY)).toBe('{"seen":true}');
  });

  it('se puede saltar en cualquier paso y tampoco vuelve', async () => {
    const user = userEvent.setup();
    const { storage } = renderFirstTime();

    await screen.findByRole('dialog', { name: DIALOG_NAME });
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    await user.click(screen.getByRole('button', { name: 'Saltar' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: DIALOG_NAME })).not.toBeInTheDocument(),
    );
    expect(storage.data.get(TUTORIAL_STORAGE_KEY)).toBe('{"seen":true}');
    expect(await screen.findByRole('link', { name: 'Ajustes' })).toBeInTheDocument();
  });

  it('no vuelve a salir en el siguiente arranque', async () => {
    renderApp({
      path: '/',
      session,
      stored: { [TUTORIAL_STORAGE_KEY]: '{"seen":true}' },
      setup: (fake) => {
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
      },
    });

    expect(await screen.findByRole('link', { name: 'Ajustes' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: DIALOG_NAME })).not.toBeInTheDocument();
  });

  it('no tapa un entrenamiento en curso', async () => {
    renderFirstTime(activeSession);

    // Se espera a que la sesión abierta llegue y se pinte: sin eso, que no esté no probaría nada.
    expect(await screen.findByRole('link', { name: 'Sesión en curso' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: DIALOG_NAME })).not.toBeInTheDocument();
  });

  it('se puede volver a ver desde Ajustes, otra vez desde el primer paso', async () => {
    const user = userEvent.setup();
    renderApp({
      path: '/settings',
      session,
      stored: { [TUTORIAL_STORAGE_KEY]: '{"seen":true}' },
      setup: (fake) => {
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
      },
    });

    await user.click(await screen.findByRole('button', { name: /^Ver el tutorial/ }));

    const dialog = await screen.findByRole('dialog', { name: DIALOG_NAME });
    expect(dialog).toHaveTextContent('Paso 1 de 5');
    expect(screen.getByRole('heading', { name: 'Hoy', level: 2 })).toBeInTheDocument();
  });
});
