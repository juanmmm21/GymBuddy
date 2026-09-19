import type { WorkoutSessionDetail } from '@gymbuddy/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { errorResponse, jsonResponse, type FakeFetch } from '../fake-fetch';
import {
  activeSession,
  benchPress,
  bodyParts,
  session,
  signals,
  weeklyCalendar,
} from '../fixtures';
import { renderApp } from './render-app';

const SHORTCUT_NAME = 'Sesión en curso';

function renderCatalog(open: WorkoutSessionDetail | null): FakeFetch {
  const { fake } = renderApp({
    path: '/catalog',
    session,
    setup: (fake) => {
      fake.on('GET', '/catalog/bodyparts', () => jsonResponse(bodyParts));
      fake.on('GET', '/sessions/active', () => jsonResponse({ session: open }));
      fake.on('GET', '/exercises', () => jsonResponse([benchPress]));
    },
  });
  return fake;
}

/**
 * Espera a que la barra haya preguntado por la sesión y a que la respuesta se pinte: sin eso, que
 * el botón no esté no probaría nada, porque tampoco estaría mientras se lee.
 */
async function sessionRead(fake: FakeFetch): Promise<void> {
  await waitFor(() =>
    expect(fake.requests.some((request) => request.path === '/sessions/active')).toBe(true),
  );
  await new Promise((resolve) => setTimeout(resolve, 50));
}

/**
 * Una animación que no termina, para poder mirar con calma lo que se está yendo. jsdom no trae Web
 * Animations, así que sin esto la salida se resuelve en la microtarea siguiente.
 */
function freezeExitAnimations(): void {
  const endless = new Promise<void>(() => undefined);
  Element.prototype.getAnimations = () => [{ finished: endless } as unknown as Animation];
}

afterEach(() => {
  // @ts-expect-error jsdom no define `getAnimations`: se devuelve el prototipo a como estaba.
  delete Element.prototype.getAnimations;
});

/** El hueco que lleva la marca, y cuántos huecos tiene la barra. */
function indicator(): { readonly index: string | null; readonly columns: string } {
  const bar = screen.getByRole('navigation', { name: 'Secciones' });
  const tabs = bar.firstElementChild as HTMLElement;
  const mark = tabs.querySelector('[data-tab-indicator]');
  return {
    index: mark?.getAttribute('data-tab-indicator') ?? null,
    columns: tabs.style.getPropertyValue('--tab-columns'),
  };
}

describe('la marca que se desliza bajo la pestaña actual', () => {
  it('se pone sobre la pestaña en la que se está y se mueve al cambiar', async () => {
    const user = userEvent.setup();
    await sessionRead(renderCatalog(null));

    expect(indicator()).toEqual({ index: '2', columns: '4' });

    const bar = screen.getByRole('navigation', { name: 'Secciones' });
    await user.click(within(bar).getByRole('link', { name: 'Hoy' }));

    expect(indicator().index).toBe('0');
  });

  it('con el botón de la sesión en medio, las pestañas de la derecha corren un hueco', async () => {
    renderCatalog(activeSession);
    await screen.findByRole('link', { name: SHORTCUT_NAME });

    expect(indicator()).toEqual({ index: '3', columns: '5' });
  });

  it('en la sesión no hay marca: el botón ya se distingue él solo', async () => {
    const user = userEvent.setup();
    renderCatalog(activeSession);

    await user.click(await screen.findByRole('link', { name: SHORTCUT_NAME }));

    await waitFor(() => expect(indicator().index).toBe('none'));
  });
});

describe('botón central de la sesión en la barra de pestañas', () => {
  it('con una sesión abierta aparece en el centro, cronometrando, desde cualquier pantalla', async () => {
    renderCatalog(activeSession);

    const bar = screen.getByRole('navigation', { name: 'Secciones' });
    const shortcut = await within(bar).findByRole('link', { name: SHORTCUT_NAME });

    expect(shortcut).toHaveAttribute('href', '/session');
    // Empezó hace quince minutos: el cronómetro no puede enseñar menos.
    expect(shortcut).toHaveTextContent(/^1[5-9]:\d\d$/);
    expect(
      within(bar)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/', '/exercises', '/session', '/catalog', '/history']);
  });

  it('lleva a la sesión en curso y se marca como la pantalla actual', async () => {
    const user = userEvent.setup();
    renderCatalog(activeSession);

    await user.click(await screen.findByRole('link', { name: SHORTCUT_NAME }));

    expect(await screen.findByRole('heading', { name: 'Press de banca' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: SHORTCUT_NAME })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('sin sesión abierta no está y la barra se queda con sus cuatro pestañas', async () => {
    await sessionRead(renderCatalog(null));

    const bar = screen.getByRole('navigation', { name: 'Secciones' });
    expect(within(bar).getAllByRole('link')).toHaveLength(4);
    expect(within(bar).queryByRole('link', { name: SHORTCUT_NAME })).not.toBeInTheDocument();
  });

  it('una sesión parada más de una hora ya no cuenta como abierta (ADR 0008)', async () => {
    const minutesAgo = (minutes: number): string =>
      new Date(Date.now() - minutes * 60_000).toISOString();
    const abandoned: WorkoutSessionDetail = {
      ...activeSession,
      startedAt: minutesAgo(210),
      sets: activeSession.sets.map((set) => ({ ...set, completedAt: minutesAgo(135) })),
    };
    await sessionRead(renderCatalog(abandoned));

    expect(screen.queryByRole('link', { name: SHORTCUT_NAME })).not.toBeInTheDocument();
  });

  it('al terminar la sesión se recoge en vez de desaparecer de golpe', async () => {
    const user = userEvent.setup();
    freezeExitAnimations();
    let current: WorkoutSessionDetail | null = activeSession;
    renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        fake.on('GET', '/sessions/active', () => jsonResponse({ session: current }));
        fake.on('GET', '/exercises', () => jsonResponse([benchPress]));
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
        fake.on('GET', '/stats/week', () => jsonResponse(weeklyCalendar));
        fake.on('POST', `/sessions/${activeSession.id}/end`, () => {
          current = null;
          return jsonResponse({
            id: activeSession.id,
            startedAt: activeSession.startedAt,
            endedAt: new Date().toISOString(),
            notes: null,
          });
        });
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Terminar sesión' }));
    const summary = await screen.findByRole('dialog', { name: 'Terminar sesión' });
    await user.click(within(summary).getByRole('button', { name: 'Terminar sesión' }));

    const shortcut = await screen.findByRole('link', { name: SHORTCUT_NAME });
    await waitFor(() => expect(shortcut).toHaveAttribute('data-session-shortcut', 'leaving'));
    // Sigue cronometrando lo que duró: durante la salida ya no hay sesión de la que sacar la hora.
    expect(shortcut).toHaveTextContent(/^1[5-9]:\d\d$/);
  });

  it('si la sesión no se puede leer, no se inventa un botón', async () => {
    const { fake } = renderApp({
      path: '/catalog',
      session,
      setup: (fake) => {
        fake.on('GET', '/catalog/bodyparts', () => jsonResponse(bodyParts));
        fake.on('GET', '/sessions/active', () => errorResponse('internal_error', 500, 'Caído'));
      },
    });

    await sessionRead(fake);

    expect(screen.queryByRole('link', { name: SHORTCUT_NAME })).not.toBeInTheDocument();
  });
});
