import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { jsonResponse } from '../fake-fetch';
import { session, sessionHistoryPage, sessionSummaries } from '../fixtures';
import { renderApp } from './render-app';

/** La query de una petición ya registrada; el `fetch` falso enruta solo por `pathname`. */
function queryOf(path: string): URLSearchParams {
  return new URL(path, 'http://localhost').searchParams;
}

describe('historial de sesiones', () => {
  it('sin sesiones explica cuándo aparecerá la primera', async () => {
    renderApp({
      path: '/history',
      session,
      setup: (fake) => {
        fake.on('GET', '/history/sessions', () => jsonResponse(sessionHistoryPage([], 0)));
      },
    });

    expect(await screen.findByText('Aún no hay sesiones')).toBeInTheDocument();
  });

  it('trae la página siguiente al pedirla y deja de ofrecerla al llegar al final', async () => {
    const user = userEvent.setup();
    renderApp({
      path: '/history',
      session,
      setup: (fake) => {
        fake.on('GET', '/history/sessions', (request) => {
          const offset = Number(queryOf(request.path).get('offset') ?? '0');
          return jsonResponse(
            offset === 0
              ? sessionHistoryPage(sessionSummaries(20), 27, 0)
              : sessionHistoryPage(sessionSummaries(7, 20), 27, 20),
          );
        });
      },
    });

    expect(await screen.findByText('27 sesiones')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(20);

    await user.click(screen.getByRole('button', { name: 'Cargar más' }));

    expect(await screen.findAllByRole('listitem')).toHaveLength(27);
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('cada sesión enlaza con su detalle', async () => {
    const [first] = sessionSummaries(1);
    renderApp({
      path: '/history',
      session,
      setup: (fake) => {
        fake.on('GET', '/history/sessions', () =>
          jsonResponse(sessionHistoryPage(sessionSummaries(1), 1)),
        );
      },
    });

    const [row] = await screen.findAllByRole('listitem');
    expect(within(row as HTMLElement).getByRole('link')).toHaveAttribute(
      'href',
      `/history/${String(first?.id)}`,
    );
  });
});
