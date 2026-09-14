import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { installSupport, USER_AGENTS } from '../install-fixtures';
import { jsonResponse } from '../fake-fetch';
import { session, signals } from '../fixtures';
import { renderApp } from './render-app';

describe('ajustes', () => {
  it('Hoy solo lleva un botón a Ajustes, sin enlaces de cuenta en la cabecera', async () => {
    renderApp({
      path: '/',
      session,
      setup: (fake) => {
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
      },
    });

    expect(await screen.findByRole('link', { name: 'Ajustes' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Invitar a un amigo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salir' })).not.toBeInTheDocument();
  });

  it('reúne la cuenta, los dispositivos, la copia y la instalación, y vuelve a Hoy', async () => {
    const user = userEvent.setup();
    renderApp({
      path: '/settings',
      session,
      install: installSupport(USER_AGENTS.iphoneSafari),
      setup: (fake) => {
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
      },
    });

    expect(await screen.findByRole('heading', { name: 'Ajustes' })).toBeInTheDocument();
    expect(screen.getByText(`Entraste como ${session.user.displayName}`)).toBeInTheDocument();
    for (const entry of [
      'Añadir otro dispositivo',
      'Invitar a un amigo',
      'Copia de seguridad',
      'Instalar la app',
    ]) {
      expect(screen.getByRole('link', { name: new RegExp(`^${entry}`) })).toBeInTheDocument();
    }

    // La vuelta de la cabecera, no la pestaña «Hoy» de abajo.
    const header = screen.getByRole('heading', { name: 'Ajustes' }).closest('header');
    if (header === null) throw new Error('La pantalla de Ajustes tiene cabecera');
    await user.click(within(header).getByRole('link', { name: /Hoy/ }));
    expect(await screen.findByRole('link', { name: 'Ajustes' })).toBeInTheDocument();
  });

  it('las pantallas de la cuenta vuelven a Ajustes, no a Hoy', async () => {
    const user = userEvent.setup();
    renderApp({
      path: '/settings',
      session,
      setup: (fake) => {
        fake.on('GET', '/auth/invitations', () => jsonResponse({ pending: [] }));
      },
    });

    await user.click(await screen.findByRole('link', { name: /^Invitar a un amigo/ }));
    expect(await screen.findByRole('heading', { name: 'Invitar a un amigo' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: /Ajustes/ }));
    expect(await screen.findByRole('heading', { name: 'Ajustes' })).toBeInTheDocument();
  });
});
