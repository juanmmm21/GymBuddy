import type { LogSetRequest, TrainingSignals, WorkoutSessionDetail } from '@gymbuddy/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MASCOT_MOOD_LABELS } from '../../src/features/mascot/labels';
import { jsonResponse, type FakeFetch } from '../fake-fetch';
import {
  activeSession,
  benchPress,
  newMaxWeightRecord,
  session,
  signals,
  squat,
  weeklyCalendar,
} from '../fixtures';
import { renderApp } from './render-app';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Las fechas se fijan respecto al reloj real: la mascota lee el instante de `useNow`, y
 * una fecha fija del pasado la dejaría dormida en cuanto el test envejeciera una semana.
 */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

/**
 * La sesión de las fixtures con fechas de hace un rato: la de siempre se abrió el 8 de
 * septiembre y, vista con el reloj real, es una sesión olvidada.
 */
function recentSession(): WorkoutSessionDetail {
  const [firstSet] = activeSession.sets;
  if (firstSet === undefined) throw new Error('La sesión de las fixtures trae una serie');

  return {
    ...activeSession,
    startedAt: minutesAgo(30),
    sets: [{ ...firstSet, completedAt: minutesAgo(10) }],
  };
}

const benchStalled: TrainingSignals['stalled'] = [
  { trackedExerciseId: benchPress.id, weight: '82.50', sessions: 3, suggestedIncrement: '2.50' },
];

function serveHome(fake: FakeFetch, current: TrainingSignals): void {
  fake.on('GET', '/stats/signals', () => jsonResponse(current));
  fake.on('GET', '/stats/week', () => jsonResponse(weeklyCalendar));
  fake.on('GET', '/exercises', () => jsonResponse([benchPress, squat]));
}

function mascotCard() {
  return within(screen.getByRole('region', { name: 'Tu compañero' }));
}

describe('la mascota en Hoy', () => {
  it('nombra el ejercicio estancado y sugiere cuánto subir', async () => {
    const { fake } = renderApp({
      path: '/',
      session,
      setup: (fake) => {
        serveHome(fake, {
          ...signals,
          lastSessionAt: daysAgo(1),
          latestRecord: null,
          stalled: benchStalled,
        });
      },
    });

    expect(await screen.findByText('Toca subir en Press de banca')).toBeInTheDocument();
    const card = mascotCard();
    expect(card.getByRole('img', { name: MASCOT_MOOD_LABELS.nudging })).toBeInTheDocument();
    expect(card.getByText(/Prueba con \+2,5 kg/)).toBeInTheDocument();
    // Los nombres salen del listado con archivados, la misma clave que la ficha del ejercicio.
    expect(fake.requests.map((request) => request.path)).toContain(
      '/exercises?includeArchived=true',
    );
  });

  it('tras varios días sin venir empuja a volver y no pide los ejercicios', async () => {
    const { fake } = renderApp({
      path: '/',
      session,
      setup: (fake) => {
        serveHome(fake, {
          ...signals,
          lastSessionAt: daysAgo(5),
          latestRecord: null,
          stalled: benchStalled,
        });
      },
    });

    expect(await screen.findByText('¿Hoy toca?')).toBeInTheDocument();
    expect(mascotCard().getByText(/La última fue hace 5 días/)).toBeInTheDocument();
    expect(fake.requests.some((request) => request.path.startsWith('/exercises'))).toBe(false);
  });

  it('una semana sin entrenar la deja dormida', async () => {
    renderApp({
      path: '/',
      session,
      setup: (fake) => {
        serveHome(fake, { ...signals, lastSessionAt: daysAgo(8), latestRecord: null });
      },
    });

    expect(await screen.findByRole('img', { name: MASCOT_MOOD_LABELS.sleepy })).toBeInTheDocument();
    expect(mascotCard().getByText(/^8 días sin vernos/)).toBeInTheDocument();
  });

  it('una sesión abierta hace horas y sin tocar pide cerrarla, y la tarjeta dice desde cuándo', async () => {
    renderApp({
      path: '/',
      session,
      setup: (fake) => {
        serveHome(fake, {
          ...signals,
          lastSessionAt: '2026-09-08T18:00:00.000Z',
          activeSessionId: activeSession.id,
          latestRecord: null,
        });
      },
    });

    expect(await screen.findByText('Te dejaste la sesión abierta')).toBeInTheDocument();
    expect(mascotCard().getByText(/«Terminar sesión»/)).toBeInTheDocument();
    expect(
      screen.getByText(/^Tienes una sesión abierta desde el mar, 8 sept a las/),
    ).toBeInTheDocument();
  });

  it('sin haber entrenado nunca saluda y no reprocha nada', async () => {
    renderApp({
      path: '/',
      session,
      setup: (fake) => {
        serveHome(fake, {
          ...signals,
          lastSessionAt: null,
          daysSinceLastSession: null,
          weeklyStreak: 0,
          sessionsThisWeek: 0,
          latestRecord: null,
        });
      },
    });

    expect(await screen.findByText('¡Buenas! Aquí estoy')).toBeInTheDocument();
    expect(screen.getByText('Todavía no has entrenado')).toBeInTheDocument();
  });
});

describe('la mascota en la sesión', () => {
  function serveSession(fake: FakeFetch, current: WorkoutSessionDetail): void {
    fake.on('GET', '/sessions/active', () => jsonResponse({ session: current }));
    fake.on('GET', '/exercises', () => jsonResponse([benchPress, squat]));
  }

  it('recién abierta y sin series anima a empezar', async () => {
    renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        serveSession(fake, { ...activeSession, startedAt: minutesAgo(2), sets: [] });
      },
    });

    expect(await screen.findByText('¡Al lío!')).toBeInTheDocument();
    expect(
      mascotCard().getByRole('img', { name: MASCOT_MOOD_LABELS.cheering }),
    ).toBeInTheDocument();
  });

  it('con el descanso cumplido pide la siguiente serie', async () => {
    renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        serveSession(fake, recentSession());
      },
    });

    expect(await screen.findByText('¿Seguimos?')).toBeInTheDocument();
  });

  it('una sesión de hace días sin tocar pide cerrarla, y una serie nueva la reactiva', async () => {
    const user = userEvent.setup();
    let current = activeSession;
    renderApp({
      path: '/session',
      session,
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
            rpe: body.rpe ?? null,
            isWarmup: body.isWarmup ?? false,
            completedAt: new Date().toISOString(),
            source: body.source,
          };
          current = { ...current, sets: [...current.sets, entry] };
          return jsonResponse({ set: entry, records: [] });
        });
      },
    });

    expect(await screen.findByText('Te dejaste la sesión abierta')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Registrar serie' }));
    await user.click(screen.getAllByRole('button', { name: 'Registrar serie' })[1] as HTMLElement);

    expect(
      await screen.findByRole('img', { name: MASCOT_MOOD_LABELS.resting }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Te dejaste la sesión abierta')).not.toBeInTheDocument();
  });

  it('una serie recién registrada la pone a descansar con lo que queda', async () => {
    const [firstSet] = activeSession.sets;
    if (firstSet === undefined) throw new Error('La sesión de las fixtures trae una serie');

    renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        serveSession(fake, {
          ...activeSession,
          sets: [{ ...firstSet, completedAt: new Date().toISOString() }],
        });
      },
    });

    expect(
      await screen.findByRole('img', { name: MASCOT_MOOD_LABELS.resting }),
    ).toBeInTheDocument();
    expect(mascotCard().getByText(/Quedan \d:\d\d de descanso/)).toBeInTheDocument();
  });

  it('una marca en la respuesta del registro la pone a celebrar', async () => {
    const user = userEvent.setup();
    let current = recentSession();
    renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        fake.on('GET', '/sessions/active', () => jsonResponse({ session: current }));
        fake.on('GET', '/exercises', () => jsonResponse([benchPress, squat]));
        fake.on('POST', `/sessions/${activeSession.id}/sets`, (request) => {
          const body = request.body as LogSetRequest;
          const completedAt = new Date().toISOString();
          const entry = {
            id: body.id,
            trackedExerciseId: body.trackedExerciseId,
            orderIndex: current.sets.length,
            weight: body.weight,
            reps: body.reps,
            rpe: body.rpe ?? null,
            isWarmup: body.isWarmup ?? false,
            completedAt,
            source: body.source,
          };
          current = { ...current, sets: [...current.sets, entry] };
          return jsonResponse({
            set: entry,
            records: [{ ...newMaxWeightRecord, setEntryId: body.id, achievedAt: completedAt }],
          });
        });
      },
    });

    expect(await screen.findByText('¿Seguimos?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Registrar serie' }));
    await user.click(screen.getAllByRole('button', { name: 'Registrar serie' })[1] as HTMLElement);

    expect(await screen.findByText('¡Récord!')).toBeInTheDocument();
    expect(
      mascotCard().getByRole('img', { name: MASCOT_MOOD_LABELS.celebrating }),
    ).toBeInTheDocument();
  });
});
