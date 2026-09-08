import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SESSION_STORAGE_KEY } from '../../src/auth/session-store';
import { errorResponse, jsonResponse } from '../fake-fetch';
import { session, signals } from '../fixtures';
import { renderApp } from './render-app';

const TELEGRAM_LINK = 'https://t.me/GymBotBuddy_bot?start=abc123';

function nonceResponse() {
  return jsonResponse(
    {
      nonce: 'abc123',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      telegramLink: TELEGRAM_LINK,
    },
    201,
  );
}

describe('entrada por el enlace del bot', () => {
  it('sin sesión, cualquier pantalla lleva a la entrada', async () => {
    renderApp({ path: '/exercises' });
    expect(await screen.findByRole('button', { name: 'Entrar con Telegram' })).toBeInTheDocument();
  });

  it('pide el nonce, enseña el enlace y abre sesión cuando el canje está listo', async () => {
    const user = userEvent.setup();
    // El sondeo con `pending` y sus esperas está cubierto en el test de `claimWithBackoff`;
    // aquí el canje responde listo a la primera para que el flujo no duerma.
    let claims = 0;

    const { fake, storage } = renderApp({
      path: '/',
      setup: (fake) => {
        fake.on('POST', '/auth/nonce', nonceResponse);
        fake.on('POST', '/auth/claim', (request) => {
          expect(request.body).toEqual({ nonce: 'abc123' });
          claims += 1;
          return jsonResponse({ status: 'ready', session });
        });
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Entrar con Telegram' }));

    expect(await screen.findByRole('heading', { name: 'Hola, Juan' })).toBeInTheDocument();
    expect(claims).toBe(1);
    expect(storage.data.get(SESSION_STORAGE_KEY)).toBe(JSON.stringify(session));

    // La sesión recién abierta ya viaja en la siguiente petición.
    const signalsRequest = fake.requests.find((r) => r.path === '/stats/signals');
    expect(signalsRequest?.headers.get('Authorization')).toBe(`Bearer ${session.token}`);
  });

  it('enseña el enlace de Telegram mientras espera, y un nonce rechazado ofrece pedir otro', async () => {
    const user = userEvent.setup();
    let claims = 0;

    renderApp({
      path: '/login',
      setup: (fake) => {
        fake.on('POST', '/auth/nonce', nonceResponse);
        fake.on('POST', '/auth/claim', () => {
          claims += 1;
          return claims === 1
            ? jsonResponse({ status: 'pending' })
            : errorResponse('nonce_invalid', 400, 'ya no sirve');
        });
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Entrar con Telegram' }));

    const link = await screen.findByRole('link', { name: 'Abrir Telegram' });
    expect(link).toHaveAttribute('href', TELEGRAM_LINK);
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.getByText('Esperando…')).toBeInTheDocument();

    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent(
      'El enlace ya no sirve',
    );
    expect(screen.getByRole('button', { name: 'Pedir otro enlace' })).toBeInTheDocument();
  });

  it('sin red al pedir el enlace lo dice, sin reventar', async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    renderApp({
      path: '/login',
      setup: (fake) => {
        fake.on('POST', '/auth/nonce', () => {
          throw new TypeError('Failed to fetch');
        });
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Entrar con Telegram' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión');
    consoleError.mockRestore();
  });

  it('con sesión, la entrada redirige al inicio', async () => {
    renderApp({
      path: '/login',
      session,
      setup: (fake) => {
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
      },
    });

    expect(await screen.findByRole('heading', { name: 'Hola, Juan' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Entrar con Telegram' })).not.toBeInTheDocument();
    });
  });
});
