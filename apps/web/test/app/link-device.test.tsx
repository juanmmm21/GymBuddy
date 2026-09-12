import type { DeviceLink } from '@gymbuddy/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { errorResponse, jsonResponse } from '../fake-fetch';
import { session, signals } from '../fixtures';
import { renderApp } from './render-app';

/*
 * La caducidad se mide contra el reloj de verdad: el `useNow` de la cuenta atrás guarda su
 * propio `Date.now` desde que se importa, así que un reloj falso no lo movería. Los dos
 * estados que pinta la pantalla se prueban con un código vivo y con uno ya caducado, y que el
 * contador baje es cosa del ticker, que tiene sus propios tests.
 */
const link = (minutesLeft: number): DeviceLink => ({
  code: 'ABCDEFGH',
  expiresAt: new Date(Date.now() + minutesLeft * 60_000).toISOString(),
});

describe('añadir otro dispositivo', () => {
  it('se llega desde Hoy y el código se pide al pulsar, no al abrir', async () => {
    const user = userEvent.setup();

    const { fake } = renderApp({
      path: '/',
      session,
      setup: (fake) => {
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
        fake.on('POST', '/auth/devices/link', () => jsonResponse(link(10), 201));
      },
    });

    await user.click(await screen.findByRole('link', { name: 'Añadir otro dispositivo' }));

    expect(
      await screen.findByRole('heading', { name: 'Añadir otro dispositivo' }),
    ).toBeInTheDocument();
    expect(fake.requests.some((request) => request.path === '/auth/devices/link')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Pedir un código' }));

    // De cuatro en cuatro: así se lee y se teclea en el otro móvil sin perder la cuenta.
    expect(await screen.findByText('ABCD-EFGH')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent(/^Caduca en \d+:\d\d$/);
  });

  it('un código caducado no se enseña: ofrece pedir otro', async () => {
    const user = userEvent.setup();
    let issued = 0;

    renderApp({
      path: '/devices',
      session,
      setup: (fake) => {
        fake.on('POST', '/auth/devices/link', () => {
          issued += 1;
          return jsonResponse(issued === 1 ? link(-1) : link(10), 201);
        });
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Pedir un código' }));

    expect(await screen.findByText('El código ha caducado')).toBeInTheDocument();
    expect(screen.queryByText('ABCD-EFGH')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Pedir otro código' }));

    expect(await screen.findByText('ABCD-EFGH')).toBeInTheDocument();
    expect(issued).toBe(2);
  });

  it('pedir otro código sustituye al que se estaba enseñando', async () => {
    const user = userEvent.setup();
    const codes = ['ABCDEFGH', 'JKMNPQRS'];

    renderApp({
      path: '/devices',
      session,
      setup: (fake) => {
        fake.on('POST', '/auth/devices/link', () =>
          jsonResponse({ ...link(10), code: codes.shift() ?? '' }, 201),
        );
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Pedir un código' }));
    expect(await screen.findByText('ABCD-EFGH')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Pedir otro código' }));

    expect(await screen.findByText('JKMN-PQRS')).toBeInTheDocument();
    expect(screen.queryByText('ABCD-EFGH')).not.toBeInTheDocument();
  });

  it('un fallo al pedirlo se explica y se puede reintentar', async () => {
    const user = userEvent.setup();
    let attempts = 0;

    renderApp({
      path: '/devices',
      session,
      setup: (fake) => {
        fake.on('POST', '/auth/devices/link', () => {
          attempts += 1;
          return attempts === 1
            ? errorResponse('internal_error', 500, 'no se pudo')
            : jsonResponse(link(10), 201);
        });
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Pedir un código' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No se ha podido pedir el código');

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('ABCD-EFGH')).toBeInTheDocument();
  });
});
