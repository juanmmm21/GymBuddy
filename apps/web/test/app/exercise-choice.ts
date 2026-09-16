import type { TrackedExercise } from '@gymbuddy/shared';
import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

type Scope = Pick<typeof screen, 'getByRole' | 'queryByRole' | 'findByRole'>;

const CHOICE_NAME = /^Cambiar ejercicio: /;

/** La tarjeta del ejercicio elegido en la hoja de registrar. */
export function chosenExerciseButton(scope: Scope = screen): HTMLElement {
  return scope.getByRole('button', { name: CHOICE_NAME });
}

export function queryChosenExerciseButton(scope: Scope = screen): HTMLElement | null {
  return scope.queryByRole('button', { name: CHOICE_NAME });
}

export function findChosenExerciseButton(scope: Scope = screen): Promise<HTMLElement> {
  return scope.findByRole('button', { name: CHOICE_NAME });
}

/** El nombre accesible de la tarjeta cuando `exercise` es el elegido. */
export function choiceNameFor(exercise: Pick<TrackedExercise, 'name'>): string {
  return `Cambiar ejercicio: ${exercise.name}`;
}

/** Abre la lista desde la tarjeta y toca la fila de `exercise`. */
export async function chooseExercise(
  user: UserEvent,
  exercise: Pick<TrackedExercise, 'name'>,
  scope: Scope = screen,
): Promise<void> {
  await user.click(chosenExerciseButton(scope));
  const picker = scope.getByRole('region', { name: 'Elegir ejercicio' });
  await user.click(within(picker).getByRole('button', { name: exercise.name }));
}
