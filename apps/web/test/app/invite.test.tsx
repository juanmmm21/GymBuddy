import type { Invitation, InvitationStatus } from '@gymbuddy/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse } from '../fake-fetch';
import { session, signals } from '../fixtures';
import { renderApp } from './render-app';

const CODE = 'ABCDEFGHJKMN';

const invitation = (code: string = CODE): Invitation => ({
  code,
  expiresAt: '2026-09-19T10:00:00.000Z',
});

const status = (pending: number, limit = 3): InvitationStatus => ({
  limit,
  remaining: Math.max(limit - pending, 0),
  pending: Array.from({ length: pending }, (_unused, index) => ({
    createdAt: `2026-09-${String(index + 10)}T10:00:00.000Z`,
    expiresAt: `2026-09-${String(index + 17)}T10:00:00.000Z`,
  })),
});

/** El portapapeles no existe en jsdom: cada test dice si el navegador deja copiar y cómo. */
function withClipboard(writeText: () => Promise<void>): void {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
});

describe('invitar a un amigo', () => {
  it('se llega desde Hoy y el código se pide al pulsar, no al abrir', async () => {
    const user = userEvent.setup();

    const { fake } = renderApp({
      path: '/',
      session,
      setup: (fake) => {
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
        fake.on('GET', '/auth/invitations', () => jsonResponse(status(0)));
        fake.on('POST', '/auth/invitations', () => jsonResponse(invitation(), 201));
      },
    });

    await user.click(await screen.findByRole('link', { name: 'Invitar a un amigo' }));

    expect(await screen.findByRole('heading', { name: 'Invitar a un amigo' })).toBeInTheDocument();
    expect(
      fake.requests.some(
        (request) => request.method === 'POST' && request.path === '/auth/invitations',
      ),
    ).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Crear una invitación' }));

    // De cuatro en cuatro, como el de añadir otro dispositivo: se lee y se copia igual.
    expect(await screen.findByText('ABCD-EFGH-JKMN')).toBeInTheDocument();
    expect(screen.getByText(/Caduca el/)).toBeInTheDocument();
  });

  it('al llegar al tope no ofrece crear otra y lo explica', async () => {
    renderApp({
      path: '/invite',
      session,
      setup: (fake) => {
        fake.on('GET', '/auth/invitations', () => jsonResponse(status(3)));
      },
    });

    expect(await screen.findByText('No te quedan invitaciones')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crear una invitación' })).not.toBeInTheDocument();
    expect(screen.getByText(/Tienes 3 invitaciones sin usar/)).toBeInTheDocument();
  });

  it('el tope del servidor se explica aunque la pantalla creyera que quedaban', async () => {
    const user = userEvent.setup();

    renderApp({
      path: '/invite',
      session,
      setup: (fake) => {
        fake.on('GET', '/auth/invitations', () => jsonResponse(status(0)));
        fake.on('POST', '/auth/invitations', () =>
          errorResponse('invitation_limit_reached', 409, 'Ya tienes 3 invitaciones sin usar.'),
        );
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Crear una invitación' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se ha podido crear la invitación');
    expect(alert).toHaveTextContent('Ya tienes 3 invitaciones sin usar.');
  });

  it('crear otra sustituye el código que se estaba enseñando y relee lo que queda', async () => {
    const user = userEvent.setup();
    const codes = [CODE, 'PQRSTVWXYZ01'];
    let issued = 0;

    renderApp({
      path: '/invite',
      session,
      setup: (fake) => {
        fake.on('GET', '/auth/invitations', () => jsonResponse(status(issued)));
        fake.on('POST', '/auth/invitations', () => {
          issued += 1;
          return jsonResponse(invitation(codes.shift() ?? ''), 201);
        });
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Crear una invitación' }));
    expect(await screen.findByText('ABCD-EFGH-JKMN')).toBeInTheDocument();
    expect(await screen.findByText(/Tienes 1 invitación sin usar/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Crear otra invitación' }));

    expect(await screen.findByText('PQRS-TVWX-YZ01')).toBeInTheDocument();
    expect(screen.queryByText('ABCD-EFGH-JKMN')).not.toBeInTheDocument();
  });

  it('copia el código agrupado y avisa si el navegador no deja', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(() => Promise.resolve());
    withClipboard(writeText);

    renderApp({
      path: '/invite',
      session,
      setup: (fake) => {
        fake.on('GET', '/auth/invitations', () => jsonResponse(status(0)));
        fake.on('POST', '/auth/invitations', () => jsonResponse(invitation(), 201));
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Crear una invitación' }));
    await user.click(await screen.findByRole('button', { name: 'Copiar el código' }));

    expect(writeText).toHaveBeenCalledWith('ABCD-EFGH-JKMN');
    expect(await screen.findByRole('button', { name: 'Código copiado' })).toBeInTheDocument();
  });

  it('si copiar falla, dice que se copie a mano', async () => {
    const user = userEvent.setup();
    // El rechazo se registra a propósito; aquí solo sería ruido en la salida del test.
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    withClipboard(() => Promise.reject(new Error('sin permiso')));

    renderApp({
      path: '/invite',
      session,
      setup: (fake) => {
        fake.on('GET', '/auth/invitations', () => jsonResponse(status(0)));
        fake.on('POST', '/auth/invitations', () => jsonResponse(invitation(), 201));
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Crear una invitación' }));
    await user.click(await screen.findByRole('button', { name: 'Copiar el código' }));

    expect(await screen.findByText('No se ha podido copiar')).toBeInTheDocument();
  });
});
