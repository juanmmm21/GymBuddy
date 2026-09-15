import type { LogSetRequest, WorkoutSessionDetail } from '@gymbuddy/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { jsonResponse, type FakeFetch } from '../fake-fetch';
import { activeSession, benchPress, session, squat } from '../fixtures';
import { renderApp } from './render-app';

/** Un Worker en memoria de la sesión abierta: lo que se registra vuelve en la relectura. */
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

describe('teclear en libras', () => {
  it('se teclea en libras, se mandan gramos y todo se lee en kilos', async () => {
    const user = userEvent.setup();
    const { fake, storage } = renderApp({ path: '/session', session, setup: serveSession });

    await user.click(await screen.findByRole('button', { name: 'Registrar serie' }));
    let sheet = within(screen.getByRole('dialog'));
    // En kilos no se enseña ninguna libra.
    expect(sheet.getByRole('button', { name: 'kg' })).toHaveAttribute('aria-pressed', 'true');
    expect(sheet.queryByText(/\d lb$/)).not.toBeInTheDocument();

    await user.click(sheet.getByRole('button', { name: 'lb' }));
    const weight = sheet.getByLabelText('Peso');
    await user.clear(weight);
    await user.type(weight, '180');
    await user.tab();
    expect(sheet.getByText('≈ 81,65 kg')).toBeInTheDocument();

    await user.click(sheet.getByRole('button', { name: 'Registrar serie' }));

    expect(await screen.findByText('81,65 kg × 8')).toBeInTheDocument();
    expect(screen.queryByText(/ lb/)).not.toBeInTheDocument();
    const logged = fake.requests.find((request) => request.path.endsWith('/sets'));
    expect((logged?.body as LogSetRequest).weight).toBe('81.65');

    // Las libras no se recuerdan: la siguiente serie vuelve a abrirse en kilos.
    expect([...storage.data.keys()].some((key) => key.includes('weight-units'))).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Registrar serie' }));
    sheet = within(screen.getByRole('dialog'));
    expect(sheet.getByRole('button', { name: 'kg' })).toHaveAttribute('aria-pressed', 'true');
    expect(sheet.getByLabelText('Peso')).toHaveValue('81.65');
  });
});
