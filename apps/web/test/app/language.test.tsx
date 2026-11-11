import type { UpdateUserRequest } from '@gymbuddy/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { LANGUAGE_STORAGE_KEY } from '../../src/i18n/index';
import { jsonResponse } from '../fake-fetch';
import { bodyParts, session, signals } from '../fixtures';
import { renderApp } from './render-app';

/** El sistema en otro idioma: `test/setup.ts` lo deja en español antes de cada test. */
function useSystemLanguages(languages: readonly string[]): void {
  Object.defineProperty(window.navigator, 'language', { value: languages[0], configurable: true });
  Object.defineProperty(window.navigator, 'languages', { value: languages, configurable: true });
}

describe('idioma de la app', () => {
  it('sin elegir ninguno, habla el del sistema y lo lleva a la cuenta', async () => {
    useSystemLanguages(['en-US', 'es-ES']);
    const { fake } = renderApp({
      path: '/',
      session,
      setup: (fake) => {
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
        fake.on('PATCH', '/auth/me', (request) => {
          const body = request.body as UpdateUserRequest;
          return jsonResponse({ ...session.user, ...body });
        });
      },
    });

    expect(await screen.findByRole('heading', { name: 'Hi, Juan' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Today/ })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');

    // La cuenta estaba en español: se pasa al idioma en el que habla la app.
    await waitFor(() => {
      expect(fake.requests.find((request) => request.method === 'PATCH')?.body).toEqual({
        locale: 'en',
      });
    });
  });

  it('con el sistema en un idioma que la app no habla, se queda con el siguiente que sí', async () => {
    useSystemLanguages(['ca-ES', 'es-ES']);
    renderApp({
      path: '/',
      session,
      setup: (fake) => {
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
      },
    });

    expect(await screen.findByRole('heading', { name: 'Hola, Juan' })).toBeInTheDocument();
  });

  it('el elegido en Ajustes manda sobre el del sistema y se recuerda en el dispositivo', async () => {
    const user = userEvent.setup();
    const { fake, storage } = renderApp({
      path: '/settings',
      session,
      setup: (fake) => {
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
        fake.on('PATCH', '/auth/me', (request) => {
          const body = request.body as UpdateUserRequest;
          return jsonResponse({ ...session.user, ...body });
        });
      },
    });

    const select = await screen.findByRole('combobox', { name: 'Idioma de la app' });
    expect(select).toHaveValue('system');

    await user.selectOptions(select, 'en');

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'App language' })).toHaveValue('en');
    expect(storage.data.get(LANGUAGE_STORAGE_KEY)).toBe('en');
    await waitFor(() => {
      expect(fake.requests.find((request) => request.method === 'PATCH')?.body).toEqual({
        locale: 'en',
      });
    });

    // Volver al del sistema (español en los tests) borra la preferencia.
    await user.selectOptions(screen.getByRole('combobox', { name: 'App language' }), 'system');
    expect(await screen.findByRole('heading', { name: 'Ajustes' })).toBeInTheDocument();
    expect(storage.data.has(LANGUAGE_STORAGE_KEY)).toBe(false);
  });

  it('el catálogo se pide en el idioma elegido', async () => {
    const { fake } = renderApp({
      path: '/catalog',
      session,
      stored: { [LANGUAGE_STORAGE_KEY]: 'en' },
      setup: (fake) => {
        fake.on('GET', '/catalog/bodyparts', () => jsonResponse(bodyParts));
        fake.on('PATCH', '/auth/me', (request) => {
          const body = request.body as UpdateUserRequest;
          return jsonResponse({ ...session.user, ...body });
        });
      },
    });

    expect(await screen.findByRole('heading', { name: 'Catalogue' })).toBeInTheDocument();
    expect(await screen.findByText('Chest')).toBeInTheDocument();
    expect(fake.requests.find((request) => request.path.startsWith('/catalog'))?.path).toBe(
      '/catalog/bodyparts?lang=en',
    );
  });

  it('antes de entrar se cambia con las banderas, arriba del todo', async () => {
    const user = userEvent.setup();
    const { storage } = renderApp({ path: '/login' });

    const languages = await screen.findByRole('group', { name: 'Idioma · Language' });
    const spanish = within(languages).getByRole('button', { name: 'Español' });
    const english = within(languages).getByRole('button', { name: 'English' });
    // El del sistema (español en los tests) sale marcado sin haber elegido nada.
    expect(spanish).toHaveAttribute('aria-pressed', 'true');
    expect(english).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    await user.click(english);

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'I have an invitation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    expect(storage.data.get(LANGUAGE_STORAGE_KEY)).toBe('en');

    await user.click(screen.getByRole('button', { name: 'Español' }));
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });
});
