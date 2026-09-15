import type { LogSetRequest, UpdateSetRequest, WorkoutSessionDetail } from '@gymbuddy/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { jsonResponse, type FakeFetch } from '../fake-fetch';
import { activeSession, benchPress, session, squat } from '../fixtures';
import { WEIGHT_UNITS_STORAGE_KEY } from '../../src/features/exercises/weight-unit-store';
import { renderApp } from './render-app';

/** Un Worker en memoria de la sesión abierta: lo que se registra o corrige vuelve en la relectura. */
function serveSession(fake: FakeFetch): void {
  let current: WorkoutSessionDetail = activeSession;
  fake.on('GET', '/sessions/active', () => jsonResponse({ session: current }));
  fake.on('GET', '/exercises', () => jsonResponse([benchPress, squat]));
  fake.on('POST', `/sessions/${activeSession.id}/sets`, (request) => {
    const body = request.body as LogSetRequest;
    const entry = {
      id: body.id,
      trackedExerciseId: body.trackedExerciseId,
      orderIndex: current.sets.length,
      weight: body.weight,
      reps: body.reps,
      rpe: body.rpe ?? null,
      isWarmup: body.isWarmup ?? false,
      completedAt: new Date().toISOString(),
    };
    current = { ...current, sets: [...current.sets, entry] };
    return jsonResponse({ set: entry, records: [] });
  });
}

const POUNDS = JSON.stringify({ [benchPress.id]: 'lb' });

const [loggedSet] = activeSession.sets;
if (loggedSet === undefined) throw new Error('La sesión de las fixtures trae una serie');

describe('sesión en libras', () => {
  it('registra en libras, manda gramos y la fila lee libras y kilos', async () => {
    const user = userEvent.setup();
    const { fake, storage } = renderApp({ path: '/session', session, setup: serveSession });

    await user.click(await screen.findByRole('button', { name: 'Registrar serie' }));
    const sheet = within(screen.getByRole('dialog'));
    await user.click(sheet.getByRole('button', { name: 'lb' }));

    // La última serie de hoy (82,5 kg) propuesta en libras, con los kilos debajo.
    const weight = sheet.getByLabelText('Peso');
    expect(weight).toHaveValue('181.9');
    expect(sheet.getByText('≈ 82,5 kg')).toBeInTheDocument();

    await user.clear(weight);
    await user.type(weight, '180');
    await user.tab();
    expect(sheet.getByText('≈ 81,65 kg')).toBeInTheDocument();

    await user.click(sheet.getByRole('button', { name: 'Registrar serie' }));

    expect(await screen.findByText('180 lb · 81,65 kg × 8')).toBeInTheDocument();
    // Lo ya registrado del mismo ejercicio también se lee en libras.
    expect(screen.getByText('181,9 lb · 82,5 kg × 8')).toBeInTheDocument();

    const logged = fake.requests.find((request) => request.path.endsWith('/sets'));
    expect((logged?.body as LogSetRequest).weight).toBe('81.65');
    expect(storage.data.get(WEIGHT_UNITS_STORAGE_KEY)).toBe(POUNDS);
  });

  it('la unidad es del ejercicio: otro sigue en kilos', async () => {
    const user = userEvent.setup();
    renderApp({
      path: '/session',
      session,
      stored: { [WEIGHT_UNITS_STORAGE_KEY]: POUNDS },
      setup: serveSession,
    });

    await user.click(await screen.findByRole('button', { name: 'Registrar serie' }));
    const sheet = within(screen.getByRole('dialog'));
    expect(sheet.getByRole('button', { name: 'lb' })).toHaveAttribute('aria-pressed', 'true');

    await user.selectOptions(sheet.getByRole('combobox', { name: 'Ejercicio' }), squat.id);
    expect(sheet.getByRole('button', { name: 'kg' })).toHaveAttribute('aria-pressed', 'true');
    expect(sheet.getByLabelText('Peso')).toHaveValue('100');
  });

  it('la unidad recordada sobrevive a volver a abrir la app y manda también al corregir', async () => {
    const user = userEvent.setup();
    const { fake } = renderApp({
      path: '/session',
      session,
      stored: { [WEIGHT_UNITS_STORAGE_KEY]: POUNDS },
      setup: (fake) => {
        serveSession(fake);
        fake.on('PATCH', `/sessions/${activeSession.id}/sets/${loggedSet.id}`, (request) => {
          const body = request.body as UpdateSetRequest;
          return jsonResponse({
            set: { ...loggedSet, weight: body.weight ?? '0.00' },
            records: [],
          });
        });
      },
    });

    await user.click(await screen.findByRole('button', { name: /181,9 lb · 82,5 kg × 8/ }));
    const sheet = within(screen.getByRole('dialog'));
    const weight = sheet.getByLabelText('Peso');
    expect(weight).toHaveValue('181.9');

    await user.clear(weight);
    await user.type(weight, '185');
    await user.click(sheet.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(fake.requests.some((request) => request.method === 'PATCH')).toBe(true);
    });
    const patch = fake.requests.find((request) => request.method === 'PATCH');
    expect((patch?.body as UpdateSetRequest).weight).toBe('83.92');
  });
});
