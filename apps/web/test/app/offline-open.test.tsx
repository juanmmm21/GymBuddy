import type { WorkoutSessionDetail } from '@gymbuddy/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { queryKeys } from '../../src/api/queries';
import { SNAPSHOT_ENTRIES, snapshotStorageKey } from '../../src/offline/device-snapshot';
import type { PendingWrite } from '../../src/offline/pending-write';
import { jsonResponse, type FakeFetch } from '../fake-fetch';
import {
  activeSession,
  benchPress,
  pushRoutine,
  session,
  signals,
  squat,
  user,
  weeklyCalendar,
} from '../fixtures';
import { renderApp } from './render-app';

const OTHER_USER_ID = '0de48f60-9b12-4d34-8f50-7b8c9d0e1f2a';
const OFFLINE_SESSION_ID = 'c0ffee00-1234-4abc-9def-0123456789ab';
const QUEUED_SET_ID = '9cd37e5f-8a01-4c23-9e4f-6a7b8c9d0e1f';
const SAVED_AT = '2026-09-08T18:15:00.000Z';

/** La clave del dispositivo de la lectura con esa clave de caché. */
function keyFor(queryKey: readonly unknown[]): string {
  const entry = SNAPSHOT_ENTRIES.find(
    (candidate) => JSON.stringify(candidate.queryKey) === JSON.stringify(queryKey),
  );
  if (entry === undefined) throw new Error(`Sin lectura guardada para ${JSON.stringify(queryKey)}`);
  return snapshotStorageKey(entry);
}

function saved(data: unknown, userId: string = user.id): string {
  return JSON.stringify({ userId, savedAt: SAVED_AT, data });
}

/** Lo que dejó en el móvil la última vez que la app tuvo red, con una sesión abierta o sin ella. */
function deviceSnapshot(open: WorkoutSessionDetail | null): Record<string, string> {
  return {
    [keyFor(queryKeys.sessions.active)]: saved({ session: open }),
    [keyFor(queryKeys.exercises.list({ includeArchived: true }))]: saved([benchPress, squat]),
    [keyFor(queryKeys.routines.list({ includeArchived: true }))]: saved([pushRoutine]),
    [keyFor(queryKeys.stats.signals)]: saved({
      ...signals,
      activeSessionId: open?.id ?? null,
      lastSessionAt: open?.startedAt ?? signals.lastSessionAt,
    }),
    [keyFor(queryKeys.stats.week)]: saved(weeklyCalendar),
  };
}

/** Sin red: cualquier petición falla como falla `fetch` en modo avión. */
function offline(fake: FakeFetch): void {
  const fail = (): Response => {
    throw new TypeError('Failed to fetch');
  };
  for (const path of [
    '/sessions/active',
    '/exercises',
    '/routines',
    '/stats/signals',
    '/stats/week',
    '/sessions',
    `/sessions/${OFFLINE_SESSION_ID}/sets`,
    `/sessions/${activeSession.id}/sets`,
    `/sessions/${activeSession.id}/end`,
  ]) {
    fake.on('GET', path, fail);
    fake.on('POST', path, fail);
  }
}

function queuedStart(): PendingWrite {
  return {
    sequence: 0,
    userId: user.id,
    queuedAt: '2026-09-09T07:00:00.000Z',
    write: {
      kind: 'start_session',
      body: { id: OFFLINE_SESSION_ID, startedAt: '2026-09-09T07:00:00.000Z' },
    },
  };
}

function queuedSet(sequence: number, sessionId: string = OFFLINE_SESSION_ID): PendingWrite {
  return {
    sequence,
    userId: user.id,
    queuedAt: '2026-09-09T07:10:00.000Z',
    write: {
      kind: 'log_set',
      sessionId,
      body: {
        id: QUEUED_SET_ID,
        trackedExerciseId: squat.id,
        weight: '100.00',
        reps: 5,
        completedAt: '2026-09-09T07:10:00.000Z',
      },
    },
  };
}

function queuedEnd(): PendingWrite {
  return {
    sequence: 0,
    userId: user.id,
    queuedAt: '2026-09-08T19:00:00.000Z',
    write: {
      kind: 'end_session',
      sessionId: activeSession.id,
      body: { endedAt: '2026-09-08T19:00:00.000Z' },
    },
  };
}

describe('abrir la app sin red', () => {
  it('la sesión abierta se ve con sus series y lo que esperaba en la cola', async () => {
    renderApp({
      path: '/session',
      session,
      stored: deviceSnapshot(activeSession),
      queued: [queuedSet(0, activeSession.id)],
      setup: offline,
    });

    // Sin spinner ni error: lo guardado se pinta en el primer pintado.
    expect(screen.getByRole('heading', { name: 'Press de banca' })).toBeInTheDocument();
    expect(screen.getAllByText('82,5 kg × 8').length).toBeGreaterThan(0);
    // La cola se lee del disco un instante después.
    expect(
      await screen.findByRole('heading', { name: 'Sentadilla con barra' }),
    ).toBeInTheDocument();
    expect(screen.getByText('100 kg × 5')).toBeInTheDocument();
    expect(screen.getByText('Sin sincronizar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar serie' })).toBeEnabled();
    expect(screen.queryByText('No se pudo cargar')).not.toBeInTheDocument();
  });

  it('una sesión empezada sin red se ofrece seguir en Hoy aunque las señales no la conozcan', async () => {
    const actor = userEvent.setup();
    renderApp({
      path: '/',
      session,
      stored: deviceSnapshot(null),
      queued: [queuedStart(), queuedSet(1)],
      setup: offline,
    });

    expect(await screen.findByText('Sesión en curso')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Empezar a entrenar' })).not.toBeInTheDocument();

    await actor.click(screen.getByRole('link', { name: 'Seguir' }));

    expect(
      await screen.findByRole('heading', { name: 'Sentadilla con barra' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Sin sincronizar')).toBeInTheDocument();
  });

  it('una sesión cerrada sin red ya no se ofrece seguir: Hoy ofrece empezar otra', async () => {
    renderApp({
      path: '/',
      session,
      stored: deviceSnapshot(activeSession),
      queued: [queuedEnd()],
      setup: offline,
    });

    expect(await screen.findByRole('link', { name: 'Empezar a entrenar' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Seguir' })).not.toBeInTheDocument();
  });

  it('lo guardado de otra cuenta no se enseña y se retira del móvil', () => {
    const stored = {
      [keyFor(queryKeys.sessions.active)]: saved({ session: activeSession }, OTHER_USER_ID),
    };
    const { storage } = renderApp({ path: '/session', session, stored, setup: offline });

    expect(screen.queryByRole('heading', { name: 'Press de banca' })).not.toBeInTheDocument();
    expect(storage.data.has(keyFor(queryKeys.sessions.active))).toBe(false);
  });
});

describe('lo que se guarda en el dispositivo', () => {
  it('con red se guarda lo que se lee, y al salir se borra', async () => {
    const actor = userEvent.setup();
    const { storage } = renderApp({
      path: '/',
      session,
      setup: (fake) => {
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
        fake.on('GET', '/stats/week', () => jsonResponse(weeklyCalendar));
        fake.on('GET', '/sessions/active', () => jsonResponse({ session: null }));
        fake.on('GET', '/routines', () => jsonResponse([pushRoutine]));
      },
    });

    await waitFor(() => {
      expect(storage.data.get(keyFor(queryKeys.stats.signals))).toBeDefined();
    });
    const savedSignals = JSON.parse(storage.data.get(keyFor(queryKeys.stats.signals)) ?? '') as {
      userId: string;
      data: unknown;
    };
    expect(savedSignals).toMatchObject({ userId: user.id, data: signals });
    await waitFor(() => {
      expect(storage.data.get(keyFor(queryKeys.sessions.active))).toBeDefined();
    });

    await actor.click(screen.getByRole('button', { name: 'Salir' }));

    await waitFor(() => {
      expect(
        SNAPSHOT_ENTRIES.filter((entry) => storage.data.has(snapshotStorageKey(entry))),
      ).toEqual([]);
    });
  });
});
