import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { jsonResponse, type FakeFetch } from '../fake-fetch';
import {
  benchPress,
  bodyParts,
  catalogArcherPushUp,
  catalogBenchPress,
  catalogPage,
  session,
  signals,
  weeklyCalendar,
} from '../fixtures';
import { renderApp } from './render-app';

/** La dirección con la que entró la pantalla que se está viendo. */
function enteredFrom(): string | null {
  const screenElement = document.querySelector('[data-screen-transition]');
  return screenElement?.getAttribute('data-screen-transition') ?? null;
}

function stubTrainingScreens(fake: FakeFetch): void {
  fake.on('GET', '/stats/signals', () => jsonResponse(signals));
  fake.on('GET', '/stats/week', () => jsonResponse(weeklyCalendar));
  fake.on('GET', '/exercises', () => jsonResponse([benchPress]));
  fake.on('GET', '/catalog/bodyparts', () => jsonResponse(bodyParts));
  fake.on('GET', '/catalog/bodyparts/chest', () =>
    jsonResponse(catalogPage([catalogBenchPress, catalogArcherPushUp], 2)),
  );
}

describe('la pantalla que entra se mueve', () => {
  it('la primera pantalla de la app no se mueve', async () => {
    renderApp({ path: '/', session, setup: stubTrainingScreens });

    expect(await screen.findByText('3 semanas')).toBeInTheDocument();
    expect(enteredFrom()).toBe('none');
  });

  it('entre pestañas entra por el lado al que se ha ido, y vuelve por el otro', async () => {
    const user = userEvent.setup();
    renderApp({ path: '/', session, setup: stubTrainingScreens });
    await screen.findByText('3 semanas');

    const bar = screen.getByRole('navigation', { name: 'Secciones' });

    await user.click(within(bar).getByRole('link', { name: 'Catálogo' }));
    await waitFor(() => expect(enteredFrom()).toBe('forward'));

    await user.click(within(bar).getByRole('link', { name: 'Hoy' }));
    await waitFor(() => expect(enteredFrom()).toBe('backward'));
  });

  it('bajar a una parte del cuerpo entra por la derecha', async () => {
    const user = userEvent.setup();
    renderApp({ path: '/catalog', session, setup: stubTrainingScreens });

    await user.click(await screen.findByRole('link', { name: /Pecho/ }));

    expect(await screen.findByRole('heading', { name: 'Pecho' })).toBeInTheDocument();
    expect(enteredFrom()).toBe('forward');
  });
});
