import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LIST_ENTRANCE_MAX_STEP, listEntranceDelayMs } from '../../src/components/index';
import { jsonResponse } from '../fake-fetch';
import { bodyParts, session, sessionHistoryPage, sessionSummaries } from '../fixtures';
import { renderApp } from './render-app';

/** El retraso con el que entró cada tarjeta de la lista que se está viendo. */
function entranceDelays(): string[] {
  return screen.getAllByRole('listitem').map((row) => row.style.animationDelay);
}

/** Los huecos de una espera con forma: el spinner es un `status` sin nada dentro. */
function skeletonRows(): number {
  return document.querySelectorAll('[role="status"] > *').length;
}

describe('esperas con la forma de lo que viene', () => {
  it('el historial espera con los huecos de sus filas y luego las pinta', async () => {
    let answer = (): void => undefined;
    const arrival = new Promise<void>((resolve) => {
      answer = resolve;
    });
    renderApp({
      path: '/history',
      session,
      setup: (fake) => {
        fake.on('GET', '/history/sessions', async () => {
          await arrival;
          return jsonResponse(sessionHistoryPage(sessionSummaries(3), 3));
        });
      },
    });

    await waitFor(() => expect(screen.getByRole('status')).toHaveAccessibleName('Cargando'));
    expect(skeletonRows()).toBeGreaterThan(1);

    answer();

    expect(await screen.findAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('las listas caen en orden', () => {
  it('cada sesión del historial entra un paso después de la anterior', async () => {
    renderApp({
      path: '/history',
      session,
      setup: (fake) => {
        fake.on('GET', '/history/sessions', () =>
          jsonResponse(sessionHistoryPage(sessionSummaries(3), 3)),
        );
      },
    });

    await screen.findAllByRole('listitem');
    expect(entranceDelays()).toEqual(
      [0, 1, 2].map((step) => `${String(listEntranceDelayMs(step))}ms`),
    );
  });

  it('una lista larga tiene tope: las de más abajo entran todas juntas', async () => {
    const rows = LIST_ENTRANCE_MAX_STEP + 3;
    renderApp({
      path: '/history',
      session,
      setup: (fake) => {
        fake.on('GET', '/history/sessions', () =>
          jsonResponse(sessionHistoryPage(sessionSummaries(rows), rows)),
        );
      },
    });

    await screen.findAllByRole('listitem');
    const delays = entranceDelays();
    const capped = `${String(listEntranceDelayMs(LIST_ENTRANCE_MAX_STEP))}ms`;

    expect(delays).toHaveLength(rows);
    expect(delays.slice(LIST_ENTRANCE_MAX_STEP)).toEqual(
      Array.from({ length: rows - LIST_ENTRANCE_MAX_STEP }, () => capped),
    );
  });

  it('las partes del cuerpo del catálogo también caen en orden', async () => {
    renderApp({
      path: '/catalog',
      session,
      setup: (fake) => {
        fake.on('GET', '/catalog/bodyparts', () => jsonResponse(bodyParts));
      },
    });

    await screen.findByRole('link', { name: /Pecho/ });
    expect(entranceDelays()).toEqual(
      [0, 1].map((step) => `${String(listEntranceDelayMs(step))}ms`),
    );
  });
});
