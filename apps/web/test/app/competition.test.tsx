import type {
  Competition,
  RivalCandidates,
  SetRivalsRequest,
  UpdateUserRequest,
} from '@gymbuddy/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SESSION_STORAGE_KEY } from '../../src/auth/session-store';
import { errorResponse, jsonResponse, type FakeFetch } from '../fake-fetch';
import { catalogBenchPress, session, signals, weeklyCalendar } from '../fixtures';
import { renderApp } from './render-app';

const ANA = '7a1d9c3e-2b4f-4a6d-8e0f-1c2d3e4f5a6b';
const LEO = '9b8c7d6e-5f4a-4b3c-9d2e-1f0a9b8c7d6e';

const self = {
  userId: session.user.id,
  displayName: session.user.displayName,
  isSelf: true,
};

/** Quien mira, solo: todavía no ha elegido a nadie. */
const alone: Competition = {
  generatedAt: '2026-10-13T18:00:00.000Z',
  weekStart: '2026-10-12',
  week: [{ ...self, rank: 1, daysTrained: 2, setCount: 18, volume: '3200.00' }],
  exercises: [],
};

/** Ana va por delante en la semana; en el press de banca gana Juan. */
const withAna: Competition = {
  ...alone,
  week: [
    {
      userId: ANA,
      displayName: 'Ana',
      isSelf: false,
      rank: 1,
      daysTrained: 3,
      setCount: 30,
      volume: '2800.00',
    },
    { ...self, rank: 2, daysTrained: 2, setCount: 18, volume: '3200.00' },
  ],
  exercises: [
    {
      catalogId: catalogBenchPress.catalogId,
      name: catalogBenchPress.name,
      gifUrl: catalogBenchPress.gifUrl,
      entries: [
        { ...self, maxWeight: '100.00', estimatedOneRepMax: '116.67' },
        {
          userId: ANA,
          displayName: 'Ana',
          isSelf: false,
          maxWeight: '60.00',
          estimatedOneRepMax: '80.00',
        },
      ],
    },
  ],
};

const candidates: RivalCandidates = {
  candidates: [
    { userId: ANA, displayName: 'Ana', competes: true, selected: false },
    { userId: LEO, displayName: 'Leo', competes: false, selected: false },
  ],
};

/** Un Worker que recuerda a quién se eligió: la clasificación cambia al guardar. */
function serveCompetition(fake: FakeFetch, initial: Competition = alone): void {
  let current = initial;
  let listed = candidates;

  fake.on('GET', '/competition', () => jsonResponse(current));
  fake.on('GET', '/competition/rivals', () => jsonResponse(listed));
  fake.on('PUT', '/competition/rivals', (request) => {
    const { rivalIds } = request.body as SetRivalsRequest;
    listed = {
      candidates: candidates.candidates.map((candidate) => ({
        ...candidate,
        selected: rivalIds.includes(candidate.userId),
      })),
    };
    current = rivalIds.includes(ANA) ? withAna : alone;

    return jsonResponse(listed);
  });
}

describe('competir con amigos', () => {
  it('se entra desde Hoy, debajo de la semana', async () => {
    const user = userEvent.setup();
    renderApp({
      path: '/',
      session,
      setup: (fake) => {
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
        fake.on('GET', '/stats/week', () => jsonResponse(weeklyCalendar));
        serveCompetition(fake);
      },
    });

    await user.click(await screen.findByRole('link', { name: /Competir con amigos/ }));

    expect(await screen.findByRole('heading', { name: 'Competir' })).toBeInTheDocument();
  });

  it('sin rivales lo dice y ofrece elegirlos', async () => {
    renderApp({ path: '/competition', session, setup: serveCompetition });

    expect(await screen.findByText('Todavía no compites con nadie')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Elegir rivales' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Esta semana' })).not.toBeInTheDocument();
  });

  it('pinta la clasificación de la semana y el cara a cara por ejercicio', async () => {
    renderApp({
      path: '/competition',
      session,
      setup: (fake) => {
        serveCompetition(fake, withAna);
      },
    });

    const week = (await screen.findByRole('heading', { name: 'Esta semana' })).closest('section');
    if (week === null) throw new Error('La semana va en su sección');
    const rows = within(week).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Ana');
    expect(rows[0]).toHaveTextContent('3 días · 30 series · 2800 kg');
    expect(within(week).getByLabelText('Puesto 1 de 2')).toHaveTextContent('1');
    expect(rows[1]).toHaveTextContent('Juan');
    expect(rows[1]).toHaveTextContent('Tú');

    const marks = within(screen.getByRole('list', { name: `Marcas en ${catalogBenchPress.name}` }));
    const entries = marks.getAllByRole('listitem');
    expect(entries[0]).toHaveTextContent('Juan');
    expect(entries[0]).toHaveTextContent('116,67 kg');
    expect(entries[0]).toHaveTextContent('Peso máximo 100 kg');
    expect(entries[1]).toHaveTextContent('Ana');
    expect(entries[1]).toHaveTextContent('80 kg');
  });

  it('elegir un rival guarda la lista entera y la clasificación le incorpora', async () => {
    const user = userEvent.setup();
    const { fake } = renderApp({ path: '/competition', session, setup: serveCompetition });

    await user.click(await screen.findByRole('button', { name: 'Elegir rivales' }));

    const dialog = within(await screen.findByRole('dialog', { name: 'Elegir rivales' }));
    const ana = await dialog.findByRole('switch', { name: 'Ana' });
    // A Leo solo le ve la cuenta de administración, y se le avisa de que no lo ha activado.
    expect(dialog.getByRole('switch', { name: 'Leo' })).toHaveAccessibleDescription(
      'No ha activado competir todavía',
    );
    expect(ana).toHaveAttribute('aria-checked', 'false');
    // Sin cambios no hay nada que guardar.
    expect(dialog.getByRole('button', { name: 'Guardar' })).toBeDisabled();

    await user.click(ana);
    expect(ana).toHaveAttribute('aria-checked', 'true');
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('heading', { name: 'Esta semana' })).toBeInTheDocument();
    expect(fake.requests.find((request) => request.method === 'PUT')?.body).toEqual({
      rivalIds: [ANA],
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Elegir rivales' })).not.toBeInTheDocument();
    });
  });

  it('si nadie ha activado competir, la hoja lo explica', async () => {
    const user = userEvent.setup();
    renderApp({
      path: '/competition',
      session,
      setup: (fake) => {
        fake.on('GET', '/competition', () => jsonResponse(alone));
        fake.on('GET', '/competition/rivals', () => jsonResponse({ candidates: [] }));
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Elegir rivales' }));

    expect(await screen.findByText('Todavía no hay nadie a quien elegir')).toBeInTheDocument();
  });

  it('un fallo al guardar se ve y la hoja sigue abierta', async () => {
    const user = userEvent.setup();
    renderApp({
      path: '/competition',
      session,
      setup: (fake) => {
        serveCompetition(fake);
        fake.on('PUT', '/competition/rivals', () =>
          errorResponse('validation_failed', 400, 'Alguno de los rivales no se puede elegir'),
        );
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Elegir rivales' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Elegir rivales' }));
    await user.click(await dialog.findByRole('switch', { name: 'Ana' }));
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));

    expect(await dialog.findByText('No se pudo guardar')).toBeInTheDocument();
  });
});

describe('la casilla de competir', () => {
  it('se activa desde Ajustes y se guarda en el perfil del móvil', async () => {
    const user = userEvent.setup();
    const { fake, storage } = renderApp({
      path: '/settings',
      session,
      setup: (fake) => {
        fake.on('PATCH', '/auth/me', (request) => {
          const body = request.body as UpdateUserRequest;
          return jsonResponse({ ...session.user, competes: body.competes });
        });
      },
    });

    const toggle = await screen.findByRole('switch', { name: 'Competir con amigos' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    await user.click(toggle);

    await waitFor(() => {
      expect(fake.requests.find((request) => request.method === 'PATCH')?.body).toEqual({
        competes: true,
      });
    });
    await waitFor(() => {
      const stored = JSON.parse(storage.data.get(SESSION_STORAGE_KEY) ?? 'null') as {
        user: { competes: boolean };
      } | null;
      expect(stored?.user.competes).toBe(true);
    });
    expect(screen.getByRole('switch', { name: 'Competir con amigos' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('link', { name: /^Ver la competición/ })).toHaveAttribute(
      'href',
      '/competition',
    );
  });

  it('también está en la pantalla de competir, y un fallo deja la casilla como estaba', async () => {
    const user = userEvent.setup();
    renderApp({
      path: '/competition',
      session,
      setup: (fake) => {
        serveCompetition(fake);
        fake.on('PATCH', '/auth/me', () => errorResponse('internal_error', 500, 'Algo falló'));
      },
    });

    const toggle = await screen.findByRole('switch', { name: 'Competir con amigos' });
    await user.click(toggle);

    expect(await screen.findByText('No se pudo guardar')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Competir con amigos' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });
});
