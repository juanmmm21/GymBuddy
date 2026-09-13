import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse, type FakeFetch } from '../fake-fetch';
import { buildExportFile } from '@gymbuddy/shared';
import {
  benchPress,
  exportPage,
  exportSnapshot,
  exportedSessions,
  session,
  signals,
} from '../fixtures';
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

/** El fichero tal y como lo descargó la app: tres sesiones, la última todavía abierta. */
function backupFile(name = 'gymbuddy-2026-09-13.json'): File {
  const sessions = exportedSessions(3).map((entry, index) =>
    index < 2 ? { ...entry, endedAt: entry.startedAt } : entry,
  );

  return new File([JSON.stringify(buildExportFile(exportSnapshot, sessions))], name, {
    type: 'application/json',
  });
}

function serveImport(fake: FakeFetch, accountExercises: unknown[] = []): void {
  fake.on('GET', '/exercises', () => jsonResponse(accountExercises));
  fake.on('POST', '/import/exercises', () => jsonResponse({ enteredAsCustom: [] }));
  fake.on('POST', '/import/routines', () => new Response(null, { status: 204 }));
  fake.on('POST', '/import/sessions', () => new Response(null, { status: 204 }));
}

describe('recuperar una copia', () => {
  it('enseña lo que trae el fichero sin escribir nada hasta pulsar', async () => {
    const user = userEvent.setup();

    const { fake } = renderApp({ path: '/backup', session, setup: (fake) => serveImport(fake) });

    await user.upload(await screen.findByLabelText('Fichero de la copia'), backupFile());

    expect(await screen.findByText(/^Copia del 13 sept/)).toBeInTheDocument();
    expect(
      screen.getByText('1 ejercicio, 3 sesiones con 3 series y 1 rutina.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/entrará cerrada a la hora de su última serie/)).toBeInTheDocument();
    expect(fake.requests.some((request) => request.path.startsWith('/import/'))).toBe(false);
  });

  it('sube la copia por lotes y dice lo que ha entrado', async () => {
    const user = userEvent.setup();

    const { fake } = renderApp({ path: '/backup', session, setup: (fake) => serveImport(fake) });

    await user.upload(await screen.findByLabelText('Fichero de la copia'), backupFile());
    await user.click(await screen.findByRole('button', { name: 'Recuperar esta copia' }));

    expect(await screen.findByText('Copia recuperada')).toBeInTheDocument();
    expect(screen.getByText('Han entrado 1 ejercicio, 3 sesiones y 1 rutina.')).toBeInTheDocument();
    expect(
      fake.requests
        .filter((request) => request.path.startsWith('/import/'))
        .map((request) => request.path),
    ).toEqual(['/import/exercises', '/import/routines', '/import/sessions']);
    expect(screen.queryByRole('button', { name: 'Recuperar esta copia' })).not.toBeInTheDocument();
  });

  it('un fichero que no es una copia se explica y no ofrece recuperarlo', async () => {
    const user = userEvent.setup({ applyAccept: false });

    renderApp({ path: '/backup', session, setup: (fake) => serveImport(fake) });

    await user.upload(
      await screen.findByLabelText('Fichero de la copia'),
      new File(['no soy json'], 'notas.txt', { type: 'text/plain' }),
    );

    expect(await screen.findByText('Este fichero no se puede recuperar')).toBeInTheDocument();
    expect(screen.getByText(/No es una copia de GymBuddy/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recuperar esta copia' })).not.toBeInTheDocument();
  });

  it('una copia de otra versión dice que el problema es la app, no el fichero', async () => {
    const user = userEvent.setup();
    const future = { ...buildExportFile(exportSnapshot, []), version: 2 };

    renderApp({ path: '/backup', session, setup: (fake) => serveImport(fake) });

    await user.upload(
      await screen.findByLabelText('Fichero de la copia'),
      new File([JSON.stringify(future)], 'gymbuddy-2030-01-01.json', { type: 'application/json' }),
    );

    expect(await screen.findByText(/es de otra versión de GymBuddy/)).toBeInTheDocument();
  });

  it('si la cuenta ya sigue un ejercicio de la copia, lo nombra y no escribe nada', async () => {
    const user = userEvent.setup();

    const { fake } = renderApp({
      path: '/backup',
      session,
      setup: (fake) => serveImport(fake, [benchPress]),
    });

    await user.upload(await screen.findByLabelText('Fichero de la copia'), backupFile());
    await user.click(await screen.findByRole('button', { name: 'Recuperar esta copia' }));

    expect(await screen.findByText('No se ha podido recuperar la copia')).toBeInTheDocument();
    expect(screen.getByText(/Ya sigues Press de banca en esta cuenta/)).toBeInTheDocument();
    expect(fake.requests.some((request) => request.path.startsWith('/import/'))).toBe(false);
  });

  it('un corte a mitad se puede reintentar sin volver a elegir el fichero', async () => {
    const user = userEvent.setup();
    let failures = 1;

    renderApp({
      path: '/backup',
      session,
      setup: (fake) => {
        serveImport(fake);
        fake.on('POST', '/import/sessions', () => {
          if (failures > 0) {
            failures -= 1;
            return errorResponse('internal_error', 500, 'Algo se ha roto en el servidor.');
          }
          return new Response(null, { status: 204 });
        });
      },
    });

    await user.upload(await screen.findByLabelText('Fichero de la copia'), backupFile());
    await user.click(await screen.findByRole('button', { name: 'Recuperar esta copia' }));

    expect(await screen.findByText(/no se repetirá al reintentar/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Copia recuperada')).toBeInTheDocument();
  });
});
