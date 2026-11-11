import type { Invitation, InvitationQuota, InvitationStatus } from '@gymbuddy/shared';
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

const status = (pending: number, quota: InvitationQuota | null = null): InvitationStatus => ({
  pending: Array.from({ length: pending }, (_unused, index) => ({
    createdAt: `2026-09-${String(index + 10)}T10:00:00.000Z`,
    expiresAt: `2026-09-${String(index + 17)}T10:00:00.000Z`,
  })),
  quota,
});

const quota = (remaining: number): InvitationQuota => ({
  limit: 3,
  windowDays: 30,
  remaining,
  renewsAt: remaining === 0 ? '2026-10-10T10:00:00.000Z' : null,
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

    await user.click(await screen.findByRole('link', { name: 'Ajustes' }));
    await user.click(await screen.findByRole('link', { name: /^Invitar a un amigo/ }));

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

  it('con invitaciones sin usar sigue ofreciendo crear otra', async () => {
    renderApp({
      path: '/invite',
      session,
      setup: (fake) => {
        fake.on('GET', '/auth/invitations', () => jsonResponse(status(7)));
      },
    });

    expect(await screen.findByText(/Tienes 7 invitaciones sin usar\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear una invitación' })).toBeEnabled();
  });

  it('si el servidor no puede crearla, lo explica y deja reintentar', async () => {
    const user = userEvent.setup();

    renderApp({
      path: '/invite',
      session,
      setup: (fake) => {
        fake.on('GET', '/auth/invitations', () => jsonResponse(status(0)));
        fake.on('POST', '/auth/invitations', () =>
          errorResponse('internal_error', 500, 'Algo ha fallado en el servidor.'),
        );
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Crear una invitación' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se ha podido crear la invitación');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
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

  it('una cuenta normal ve cuántas le quedan', async () => {
    renderApp({
      path: '/invite',
      session,
      setup: (fake) => {
        fake.on('GET', '/auth/invitations', () => jsonResponse(status(1, quota(2))));
      },
    });

    expect(
      await screen.findByText(/Te quedan 2 invitaciones de 3 en estos 30 días/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear una invitación' })).toBeEnabled();
  });

  it('con el cupo agotado no deja pedir otra y dice cuándo podrá', async () => {
    renderApp({
      path: '/invite',
      session,
      setup: (fake) => {
        fake.on('GET', '/auth/invitations', () => jsonResponse(status(3, quota(0))));
      },
    });

    expect(await screen.findByText('Has creado todas tus invitaciones')).toBeInTheDocument();
    expect(screen.getByText(/Podrás crear otra el/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear una invitación' })).toBeDisabled();
  });

  it('si el cupo se agota al pedirla, lo explica sin ofrecer reintentar', async () => {
    const user = userEvent.setup();
    let exhausted = false;

    renderApp({
      path: '/invite',
      session,
      setup: (fake) => {
        fake.on('GET', '/auth/invitations', () =>
          jsonResponse(status(0, quota(exhausted ? 0 : 1))),
        );
        fake.on('POST', '/auth/invitations', () => {
          exhausted = true;
          return errorResponse('invitation_limit_reached', 429, 'Cupo agotado');
        });
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Crear una invitación' }));

    expect(
      await screen.findByText('Ya has creado todas las invitaciones que tocan por ahora.'),
    ).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Crear una invitación' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });
});
