import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse, type FakeFetch } from '../fake-fetch';
import { exportPage, exportSnapshot, exportedSessions, session, signals } from '../fixtures';
import { renderApp } from './render-app';

let downloads: string[];

/** jsdom no descarga nada: se apunta el nombre de cada fichero que la app intenta entregar. */
beforeEach(() => {
  downloads = [];
  Object.defineProperty(URL, 'createObjectURL', {
    value: () => 'blob:http://localhost/copia',
    configurable: true,
  });
  Object.defineProperty(URL, 'revokeObjectURL', { value: () => undefined, configurable: true });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push(this.download);
  });
});

afterEach(() => {
  Reflect.deleteProperty(URL, 'createObjectURL');
  Reflect.deleteProperty(URL, 'revokeObjectURL');
  vi.restoreAllMocks();
});

function serveExport(fake: FakeFetch, total: number): void {
  fake.on('GET', '/export/sessions', () =>
    jsonResponse(exportPage(exportedSessions(total), total, 0)),
  );
  fake.on('GET', '/export/snapshot', () => jsonResponse(exportSnapshot));
}

describe('copia de seguridad', () => {
  it('se llega desde Hoy y no pide nada hasta pulsar', async () => {
    const user = userEvent.setup();

    const { fake } = renderApp({
      path: '/',
      session,
      setup: (fake) => {
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
        serveExport(fake, 3);
      },
    });

    await user.click(await screen.findByRole('link', { name: 'Copia de seguridad' }));

    expect(await screen.findByRole('heading', { name: 'Copia de seguridad' })).toBeInTheDocument();
    expect(fake.requests.some((request) => request.path.startsWith('/export/'))).toBe(false);
  });

  it('descarga el fichero y resume lo que lleva', async () => {
    const user = userEvent.setup();

    renderApp({ path: '/backup', session, setup: (fake) => serveExport(fake, 3) });

    await user.click(await screen.findByRole('button', { name: 'Descargar mis datos' }));

    expect(await screen.findByText('Copia descargada')).toBeInTheDocument();
    expect(
      screen.getByText(/gymbuddy-2026-09-13\.json: 3 sesiones, 1 ejercicio y 1 rutina/),
    ).toBeInTheDocument();
    expect(downloads).toEqual(['gymbuddy-2026-09-13.json']);
    expect(screen.getByRole('button', { name: 'Descargar otra vez' })).toBeInTheDocument();
  });

  it('un fallo del servidor se explica y se puede reintentar', async () => {
    const user = userEvent.setup();
    let failures = 1;

    renderApp({
      path: '/backup',
      session,
      setup: (fake) => {
        serveExport(fake, 2);
        fake.on('GET', '/export/snapshot', () => {
          if (failures > 0) {
            failures -= 1;
            return errorResponse('internal_error', 500, 'Algo se ha roto en el servidor.');
          }
          return jsonResponse(exportSnapshot);
        });
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Descargar mis datos' }));

    expect(await screen.findByText('No se ha podido descargar la copia')).toBeInTheDocument();
    expect(screen.getByText('Algo se ha roto en el servidor.')).toBeInTheDocument();
    expect(downloads).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Copia descargada')).toBeInTheDocument();
    expect(screen.queryByText('No se ha podido descargar la copia')).not.toBeInTheDocument();
  });

  it('si el navegador no deja guardar ficheros, no da la copia por hecha', async () => {
    const user = userEvent.setup();
    Reflect.deleteProperty(URL, 'createObjectURL');

    renderApp({ path: '/backup', session, setup: (fake) => serveExport(fake, 1) });

    await user.click(await screen.findByRole('button', { name: 'Descargar mis datos' }));

    expect(await screen.findByText(/no deja guardar ficheros desde aquí/)).toBeInTheDocument();
    expect(screen.queryByText('Copia descargada')).not.toBeInTheDocument();
  });
});
