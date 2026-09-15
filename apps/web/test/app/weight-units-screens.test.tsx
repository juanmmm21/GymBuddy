import type { LogSetRequest, WorkoutSessionDetail } from '@gymbuddy/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { jsonResponse } from '../fake-fetch';
import {
  activeSession,
  benchPress,
  benchPressHistory,
  benchPressStats,
  newMaxWeightRecord,
  pastSession,
  session,
  signals,
  squat,
  weeklyCalendar,
} from '../fixtures';
import { WEIGHT_UNITS_STORAGE_KEY } from '../../src/features/exercises/weight-unit-store';
import { renderApp } from './render-app';

/** El press de banca se registra en libras en este móvil; la sentadilla, en kilos. */
const POUNDS = { [WEIGHT_UNITS_STORAGE_KEY]: JSON.stringify({ [benchPress.id]: 'lb' }) };

describe('la unidad del ejercicio fuera del registro', () => {
  it('el detalle del historial lee cada ejercicio en la suya', async () => {
    renderApp({
      path: `/history/${pastSession.id}`,
      session,
      stored: POUNDS,
      setup: (fake) => {
        fake.on('GET', `/sessions/${pastSession.id}`, () => jsonResponse(pastSession));
        fake.on('GET', '/exercises', () => jsonResponse([benchPress, squat]));
      },
    });

    expect(await screen.findByText('187,4 lb · 85 kg × 6')).toBeInTheDocument();
    expect(screen.getByText('132,3 lb · 60 kg × 10')).toBeInTheDocument();
    expect(screen.getByText('100 kg × 5')).toBeInTheDocument();
    // El volumen mezcla ejercicios: sigue en kilos.
    expect(screen.getByText('1010 kg')).toBeInTheDocument();
  });

  it('la ficha lee en libras el peso habitual, el estancamiento, las marcas y las series', async () => {
    renderApp({
      path: `/exercises/${benchPress.id}`,
      session,
      stored: POUNDS,
      setup: (fake) => {
        fake.on('GET', '/exercises', () => jsonResponse([benchPress]));
        fake.on('GET', `/stats/exercise/${benchPress.id}`, () => jsonResponse(benchPressStats));
        fake.on('GET', `/history/exercises/${benchPress.id}`, () =>
          jsonResponse(benchPressHistory),
        );
      },
    });

    // La cifra y las repeticiones van en nodos distintos: se lee el párrafo entero.
    const working = await screen.findByText(
      (_, element) => element?.tagName === 'P' && element.textContent === '181,9 lb × 8',
    );
    expect(working.nextElementSibling).toHaveTextContent('82,5 kg');
    expect(screen.getByText('Estancado en 181,9 lb · 82,5 kg')).toBeInTheDocument();
    expect(screen.getByText(/Prueba con 5,5 lb · 2,5 kg más\./)).toBeInTheDocument();

    const records = within(screen.getByRole('list', { name: 'Marcas' }));
    expect(records.getByText('187,4 lb · 85 kg')).toBeInTheDocument();
    expect(records.getByText('230,4 lb · 104,5 kg')).toBeInTheDocument();

    expect(await screen.findByText('187,4 lb · 85 kg × 6')).toBeInTheDocument();
  });

  it('la ficha de un ejercicio sin libras recordadas sigue en kilos', async () => {
    renderApp({
      path: `/exercises/${benchPress.id}`,
      session,
      stored: { [WEIGHT_UNITS_STORAGE_KEY]: JSON.stringify({ [squat.id]: 'lb' }) },
      setup: (fake) => {
        fake.on('GET', '/exercises', () => jsonResponse([benchPress]));
        fake.on('GET', `/stats/exercise/${benchPress.id}`, () => jsonResponse(benchPressStats));
        fake.on('GET', `/history/exercises/${benchPress.id}`, () =>
          jsonResponse(benchPressHistory),
        );
      },
    });

    expect(await screen.findByText('82,5 kg × 8')).toBeInTheDocument();
    expect(screen.getByText('Estancado en 82,5 kg')).toBeInTheDocument();
    expect(screen.queryByText(/lb/)).not.toBeInTheDocument();
  });

  it('mis ejercicios pone las libras en la etiqueta y los kilos junto al músculo', async () => {
    renderApp({
      path: '/exercises',
      session,
      stored: POUNDS,
      setup: (fake) => {
        fake.on('GET', '/exercises', () => jsonResponse([benchPress, squat]));
      },
    });

    expect(await screen.findByText('181,9 lb × 8')).toBeInTheDocument();
    expect(screen.getByText('Pectorales · 82,5 kg')).toBeInTheDocument();
  });

  it('Hoy lee en libras el último récord y la última serie de la sesión en curso', async () => {
    renderApp({
      path: '/',
      session,
      stored: POUNDS,
      setup: (fake) => {
        fake.on('GET', '/stats/signals', () =>
          jsonResponse({ ...signals, activeSessionId: activeSession.id }),
        );
        fake.on('GET', '/stats/week', () => jsonResponse(weeklyCalendar));
        fake.on('GET', '/sessions/active', () => jsonResponse({ session: activeSession }));
        fake.on('GET', '/exercises', () => jsonResponse([benchPress, squat]));
      },
    });

    expect(await screen.findByText('187,4 lb')).toBeInTheDocument();
    expect(screen.getByText('85 kg')).toBeInTheDocument();

    const live = within(screen.getByRole('link', { name: 'Seguir la sesión' }));
    expect(await live.findByText('181,9 lb × 8')).toBeInTheDocument();
    expect(live.getByText('Última serie · 82,5 kg')).toBeInTheDocument();
  });

  it('la marca de la sesión y el resumen al terminar van en la unidad de su ejercicio', async () => {
    const user = userEvent.setup();
    let current: WorkoutSessionDetail = activeSession;
    renderApp({
      path: '/session',
      session,
      stored: POUNDS,
      setup: (fake) => {
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
            rpe: null,
            isWarmup: false,
            completedAt: new Date().toISOString(),
          };
          current = { ...current, sets: [...current.sets, entry] };
          return jsonResponse({
            set: entry,
            records: [{ ...newMaxWeightRecord, achievedAt: new Date().toISOString() }],
          });
        });
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Registrar serie' }));
    await user.click(screen.getAllByRole('button', { name: 'Registrar serie' })[1] as HTMLElement);

    expect(await screen.findByText('1 marca nueva')).toBeInTheDocument();
    expect(screen.getByText('Peso máximo: 198,4 lb · 90 kg')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Terminar sesión' }));
    const sheet = within(screen.getByRole('dialog', { name: 'Terminar sesión' }));
    expect(sheet.getByText('Peso máximo: 198,4 lb · 90 kg')).toBeInTheDocument();
  });
});
