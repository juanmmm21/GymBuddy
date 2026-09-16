import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { jsonResponse, type FakeFetch } from '../fake-fetch';
import { activeSession, benchPress, customCurl, session, squat } from '../fixtures';
import { choiceNameFor, chooseExercise, chosenExerciseButton } from './exercise-choice';
import { renderApp } from './render-app';

/** Sesión abierta con una serie de press de banca y tres ejercicios de tres partes del cuerpo. */
function serveSession(fake: FakeFetch): void {
  fake.on('GET', '/sessions/active', () => jsonResponse({ session: activeSession }));
  fake.on('GET', '/exercises', () => jsonResponse([benchPress, squat, customCurl]));
}

async function openPicker(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.click(await screen.findByRole('button', { name: 'Registrar serie' }));
  await user.click(chosenExerciseButton());
  return screen.getByRole('region', { name: 'Elegir ejercicio' });
}

describe('sesión: elegir ejercicio al registrar', () => {
  it('la hoja enseña el elegido en una tarjeta y la lista pone arriba los de su mismo grupo', async () => {
    const user = userEvent.setup();
    renderApp({ path: '/session', session, setup: serveSession });

    await user.click(await screen.findByRole('button', { name: 'Registrar serie' }));
    const choice = chosenExerciseButton();
    expect(choice).toHaveAccessibleName(choiceNameFor(benchPress));
    expect(within(choice).getByText('Pecho')).toBeInTheDocument();

    await user.click(choice);
    const picker = screen.getByRole('region', { name: 'Elegir ejercicio' });
    const sections = within(picker)
      .getAllByRole('region')
      .map((section) => section.getAttribute('aria-labelledby'))
      .map((id) => (id === null ? '' : (document.getElementById(id)?.textContent ?? '')));
    expect(sections).toEqual(['Mismo grupo: Pecho', 'Piernas', 'Brazos']);

    const bench = within(picker).getByRole('button', { name: benchPress.name });
    expect(bench).toHaveAttribute('aria-pressed', 'true');
    // Hoy ya lleva una serie de press (82,5 kg × 8): es lo que se precargaría.
    expect(bench).toHaveAccessibleDescription('Pecho · 82,5 kg × 8');
    expect(within(picker).getByRole('button', { name: squat.name })).toHaveAccessibleDescription(
      'Piernas · 100 kg × 5',
    );
    expect(
      within(picker).getByRole('button', { name: customCurl.name }),
    ).toHaveAccessibleDescription('Brazos · Sin series');
    // El formulario no se ve mientras se elige.
    expect(screen.getByLabelText('Peso')).not.toBeVisible();
  });

  it('elegir otro recarga su última serie y vuelve al formulario', async () => {
    const user = userEvent.setup();
    renderApp({ path: '/session', session, setup: serveSession });

    await user.click(await screen.findByRole('button', { name: 'Registrar serie' }));
    await chooseExercise(user, squat);

    expect(screen.queryByRole('region', { name: 'Elegir ejercicio' })).not.toBeInTheDocument();
    expect(chosenExerciseButton()).toHaveAccessibleName(choiceNameFor(squat));
    expect(screen.getByLabelText('Peso')).toHaveValue('100');
    expect(screen.getByLabelText('Repeticiones')).toHaveValue('5');
  });

  it('volver sin elegir, o tocar el mismo, conserva lo tecleado', async () => {
    const user = userEvent.setup();
    renderApp({ path: '/session', session, setup: serveSession });

    await user.click(await screen.findByRole('button', { name: 'Registrar serie' }));
    await user.clear(screen.getByLabelText('Repeticiones'));
    await user.type(screen.getByLabelText('Repeticiones'), '6');

    await user.click(chosenExerciseButton());
    await user.click(screen.getByRole('button', { name: '‹ Volver' }));
    expect(screen.getByLabelText('Repeticiones')).toHaveValue('6');

    await chooseExercise(user, benchPress);
    expect(screen.getByLabelText('Repeticiones')).toHaveValue('6');
  });

  it('el buscador ignora tildes y mayúsculas, y los chips filtran por parte del cuerpo', async () => {
    const user = userEvent.setup();
    renderApp({ path: '/session', session, setup: serveSession });

    const picker = await openPicker(user);
    const shown = (): string[] =>
      within(picker)
        .queryAllByRole('button')
        .map((button) => button.getAttribute('aria-label') ?? '')
        .filter((name) => [benchPress.name, squat.name, customCurl.name].includes(name))
        .sort();

    await user.type(
      within(picker).getByRole('searchbox', { name: 'Buscar en tus ejercicios' }),
      'SENTÁDILLA',
    );
    expect(shown()).toEqual([squat.name]);

    await user.click(within(picker).getByRole('button', { name: 'Borrar búsqueda' }));
    const chips = within(within(picker).getByRole('group', { name: 'Parte del cuerpo' }));
    expect(chips.getAllByRole('button').map((chip) => chip.textContent)).toEqual([
      'Todos',
      'Pecho',
      'Piernas',
      'Brazos',
    ]);
    await user.click(chips.getByRole('button', { name: 'Brazos' }));
    expect(chips.getByRole('button', { name: 'Brazos' })).toHaveAttribute('aria-pressed', 'true');
    expect(shown()).toEqual([customCurl.name]);

    await user.type(
      within(picker).getByRole('searchbox', { name: 'Buscar en tus ejercicios' }),
      'press',
    );
    expect(shown()).toEqual([]);
    expect(within(picker).getByText('Ningún ejercicio coincide')).toBeInTheDocument();
  });
});
