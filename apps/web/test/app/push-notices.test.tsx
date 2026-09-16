import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { jsonResponse, type FakeFetch } from '../fake-fetch';
import { session, signals } from '../fixtures';
import { installSupport, USER_AGENTS } from '../install-fixtures';
import { createFakePushBrowser, VAPID_PUBLIC_KEY } from '../push-fixtures';
import { renderApp } from './render-app';

const SWITCH_NAME = 'Aviso al acabar el descanso';
const installedIphone = installSupport(USER_AGENTS.iphoneSafari, { standalone: true });

function serveSettings(publicKey: string | null) {
  return (fake: FakeFetch): void => {
    fake.on('GET', '/stats/signals', () => jsonResponse(signals));
    fake.on('GET', '/push/config', () => jsonResponse({ publicKey }));
    fake.on('PUT', '/push/subscription', () => new Response(null, { status: 204 }));
    fake.on('DELETE', '/push/subscription', () => new Response(null, { status: 204 }));
  };
}

describe('aviso de fin de descanso en Ajustes', () => {
  it('en el iPhone instalado se enciende con permiso y guarda la suscripción en el Worker', async () => {
    const user = userEvent.setup();
    const browser = createFakePushBrowser();
    const { fake } = renderApp({
      path: '/settings',
      session,
      install: installedIphone,
      pushBrowser: browser,
      setup: serveSettings(VAPID_PUBLIC_KEY),
    });

    const toggle = await screen.findByRole('switch', { name: SWITCH_NAME });
    await waitFor(() => {
      expect(toggle).toBeEnabled();
    });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    // Abrir Ajustes no pregunta nada: el permiso se pide solo al tocar.
    expect(browser.permissionRequests()).toBe(0);

    await user.click(toggle);

    await waitFor(() => {
      expect(toggle).toHaveAttribute('aria-checked', 'true');
    });
    expect(browser.permissionRequests()).toBe(1);
    const saved = fake.requests.find((request) => request.method === 'PUT');
    expect(saved?.path).toBe('/push/subscription');
    expect(saved?.body).toMatchObject({ endpoint: browser.current()?.endpoint });
  });

  it('encendido se apaga: retira la suscripción del navegador y del Worker', async () => {
    const user = userEvent.setup();
    const browser = createFakePushBrowser({
      permission: 'granted',
      subscribedWith: VAPID_PUBLIC_KEY,
    });
    const { fake } = renderApp({
      path: '/settings',
      session,
      pushBrowser: browser,
      setup: serveSettings(VAPID_PUBLIC_KEY),
    });

    const toggle = await screen.findByRole('switch', { name: SWITCH_NAME });
    await waitFor(() => {
      expect(toggle).toHaveAttribute('aria-checked', 'true');
    });

    await user.click(toggle);

    await waitFor(() => {
      expect(toggle).toHaveAttribute('aria-checked', 'false');
    });
    expect(browser.current()).toBeNull();
    expect(fake.requests.some((request) => request.method === 'DELETE')).toBe(true);
  });

  it('con el permiso negado explica cómo desbloquearlo y no ofrece el interruptor', async () => {
    renderApp({
      path: '/settings',
      session,
      pushBrowser: createFakePushBrowser({ permission: 'denied' }),
      setup: serveSettings(VAPID_PUBLIC_KEY),
    });

    expect(await screen.findByText('Notificaciones bloqueadas')).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: SWITCH_NAME })).toBeNull();
  });

  it('en un iPhone sin instalar manda a instalar la app', async () => {
    renderApp({
      path: '/settings',
      session,
      install: installSupport(USER_AGENTS.iphoneSafari),
      pushBrowser: createFakePushBrowser(),
      setup: serveSettings(VAPID_PUBLIC_KEY),
    });

    expect(
      await screen.findByText(/solo llega con la app en la pantalla de inicio/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: SWITCH_NAME })).toBeNull();
  });

  it('sin claves en el servidor el interruptor no se puede encender', async () => {
    renderApp({
      path: '/settings',
      session,
      pushBrowser: createFakePushBrowser(),
      setup: serveSettings(null),
    });

    expect(
      await screen.findByText('El servidor todavía no tiene las claves para mandar avisos.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: SWITCH_NAME })).toBeDisabled();
  });

  it('en un navegador sin push lo dice', async () => {
    renderApp({ path: '/settings', session, setup: serveSettings(VAPID_PUBLIC_KEY) });

    expect(
      await screen.findByText('Este navegador no puede recibir el aviso de fin de descanso.'),
    ).toBeInTheDocument();
  });
});
