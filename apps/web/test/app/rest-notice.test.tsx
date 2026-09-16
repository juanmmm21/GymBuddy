import type {
  LogStrengthSetRequest,
  RestNoticeRequest,
  SetEntry,
  WorkoutSessionDetail,
} from '@gymbuddy/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { jsonResponse, type FakeFetch, type RecordedRequest } from '../fake-fetch';
import { activeSession, benchPress, session, signals, squat } from '../fixtures';
import { createFakePushBrowser, VAPID_PUBLIC_KEY } from '../push-fixtures';
import { renderApp } from './render-app';

const REST_NOTICE_PATH = '/push/rest-notice';
const [fixtureSet] = activeSession.sets;
if (fixtureSet === undefined) throw new Error('La sesión de las fixtures trae una serie');

/** Un móvil con el aviso ya encendido: permiso dado y suscripción viva. */
function enabledBrowser() {
  return createFakePushBrowser({ permission: 'granted', subscribedWith: VAPID_PUBLIC_KEY });
}

function secondsAgo(seconds: number): string {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

function plusSeconds(iso: string, seconds: number): string {
  return new Date(Date.parse(iso) + seconds * 1000).toISOString();
}

/** Una sesión con su única serie registrada hace `seconds` segundos. */
function sessionRestingFor(seconds: number): WorkoutSessionDetail {
  return {
    ...activeSession,
    sets: [{ ...fixtureSet, completedAt: secondsAgo(seconds) } as SetEntry],
  };
}

function noticeRequests(fake: FakeFetch): RecordedRequest[] {
  return fake.requests.filter((request) => request.path === REST_NOTICE_PATH);
}

function serveNotice(fake: FakeFetch): void {
  fake.on('PUT', REST_NOTICE_PATH, () => new Response(null, { status: 204 }));
  fake.on('DELETE', REST_NOTICE_PATH, () => new Response(null, { status: 204 }));
}

describe('aviso de fin de descanso desde la sesión', () => {
  it('con el aviso encendido programa el fin del descanso: la última serie más el objetivo', async () => {
    const current = sessionRestingFor(30);
    const lastSetAt = current.sets[0]?.completedAt ?? '';
    const { fake } = renderApp({
      path: '/session',
      session,
      pushBrowser: enabledBrowser(),
      setup: (fake) => {
        fake.on('GET', '/sessions/active', () => jsonResponse({ session: current }));
        fake.on('GET', '/exercises', () => jsonResponse([benchPress, squat]));
        serveNotice(fake);
      },
    });

    await waitFor(() => {
      expect(noticeRequests(fake)).toHaveLength(1);
    });
    const [put] = noticeRequests(fake);
    expect(put?.method).toBe('PUT');
    expect(put?.body).toEqual({
      sessionId: activeSession.id,
      endsAt: plusSeconds(lastSetAt, 120),
    } satisfies RestNoticeRequest);
  });

  it('cambiar el objetivo lo reprograma a la hora nueva', async () => {
    const user = userEvent.setup();
    const current = sessionRestingFor(30);
    const lastSetAt = current.sets[0]?.completedAt ?? '';
    const { fake } = renderApp({
      path: '/session',
      session,
      pushBrowser: enabledBrowser(),
      setup: (fake) => {
        fake.on('GET', '/sessions/active', () => jsonResponse({ session: current }));
        fake.on('GET', '/exercises', () => jsonResponse([benchPress, squat]));
        serveNotice(fake);
      },
    });

    const rest = within(await screen.findByRole('region', { name: 'Descanso' }));
    await waitFor(() => {
      expect(noticeRequests(fake)).toHaveLength(1);
    });
    await user.click(rest.getByRole('button', { name: '3:00' }));

    await waitFor(() => {
      expect(noticeRequests(fake)).toHaveLength(2);
    });
    expect(noticeRequests(fake)[1]?.body).toEqual({
      sessionId: activeSession.id,
      endsAt: plusSeconds(lastSetAt, 180),
    });
  });

  it('registrar la siguiente serie lo reprograma desde esa serie', async () => {
    const user = userEvent.setup();
    let current = sessionRestingFor(30);
    const { fake } = renderApp({
      path: '/session',
      session,
      pushBrowser: enabledBrowser(),
      setup: (fake) => {
        fake.on('GET', '/sessions/active', () => jsonResponse({ session: current }));
        fake.on('GET', '/exercises', () => jsonResponse([benchPress, squat]));
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
        fake.on('POST', `/sessions/${activeSession.id}/sets`, (request) => {
          const body = request.body as LogStrengthSetRequest;
          const entry: SetEntry = {
            id: body.id,
            trackedExerciseId: body.trackedExerciseId,
            kind: 'strength',
            orderIndex: current.sets.length,
            weight: body.weight,
            reps: body.reps,
            rpe: body.rpe ?? null,
            isWarmup: body.isWarmup ?? false,
            completedAt: body.completedAt ?? new Date().toISOString(),
          };
          current = { ...current, sets: [...current.sets, entry] };
          return jsonResponse({ set: entry, records: [] });
        });
        serveNotice(fake);
      },
    });

    await waitFor(() => {
      expect(noticeRequests(fake)).toHaveLength(1);
    });
    await user.click(await screen.findByRole('button', { name: 'Registrar serie' }));
    await user.click(screen.getAllByRole('button', { name: 'Registrar serie' })[1] as HTMLElement);

    await waitFor(() => {
      expect(noticeRequests(fake)).toHaveLength(2);
    });
    const logged = fake.requests.find((request) => request.path.endsWith('/sets'));
    const completedAt = (logged?.body as LogStrengthSetRequest).completedAt ?? '';
    expect(noticeRequests(fake)[1]?.body).toEqual({
      sessionId: activeSession.id,
      endsAt: plusSeconds(completedAt, 120),
    });
  });

  it('si deja de haber descanso quita el aviso que programó', async () => {
    const user = userEvent.setup();
    let current = sessionRestingFor(30);
    const setId = current.sets[0]?.id ?? '';
    const { fake } = renderApp({
      path: '/session',
      session,
      pushBrowser: enabledBrowser(),
      setup: (fake) => {
        fake.on('GET', '/sessions/active', () => jsonResponse({ session: current }));
        fake.on('GET', '/exercises', () => jsonResponse([benchPress, squat]));
        fake.on('DELETE', `/sessions/${activeSession.id}/sets/${setId}`, () => {
          current = { ...current, sets: [] };
          return new Response(null, { status: 204 });
        });
        serveNotice(fake);
      },
    });

    await waitFor(() => {
      expect(noticeRequests(fake)).toHaveLength(1);
    });
    await user.click(await screen.findByRole('button', { name: /82,5 kg × 8/ }));
    await user.click(screen.getByRole('button', { name: 'Borrar serie' }));

    await waitFor(() => {
      expect(noticeRequests(fake).map((request) => request.method)).toEqual(['PUT', 'DELETE']);
    });
  });

  it('un descanso ya cumplido no programa nada', async () => {
    const { fake } = renderApp({
      path: '/session',
      session,
      pushBrowser: enabledBrowser(),
      setup: (fake) => {
        fake.on('GET', '/sessions/active', () => jsonResponse({ session: activeSession }));
        fake.on('GET', '/exercises', () => jsonResponse([benchPress, squat]));
        serveNotice(fake);
      },
    });

    const rest = within(await screen.findByRole('region', { name: 'Descanso' }));
    expect(rest.getByText(/Descanso cumplido/)).toBeInTheDocument();
    // Da tiempo a que el navegador conteste que el aviso está encendido.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(noticeRequests(fake)).toEqual([]);
  });

  it('con el aviso apagado en este dispositivo no se le pide nada al Worker', async () => {
    const current = sessionRestingFor(30);
    const { fake } = renderApp({
      path: '/session',
      session,
      // Con permiso pero sin suscripción: el aviso se apagó en Ajustes.
      pushBrowser: createFakePushBrowser({ permission: 'granted' }),
      setup: (fake) => {
        fake.on('GET', '/sessions/active', () => jsonResponse({ session: current }));
        fake.on('GET', '/exercises', () => jsonResponse([benchPress, squat]));
        serveNotice(fake);
      },
    });

    expect(await screen.findByRole('region', { name: 'Descanso' })).toBeInTheDocument();
    // Da tiempo a que el navegador conteste que no hay suscripción.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(noticeRequests(fake)).toEqual([]);
  });

  it('terminar la sesión quita el aviso pendiente', async () => {
    const user = userEvent.setup();
    let ended = false;
    const current = sessionRestingFor(30);
    const { fake } = renderApp({
      path: '/session',
      session,
      pushBrowser: enabledBrowser(),
      setup: (fake) => {
        fake.on('GET', '/sessions/active', () => jsonResponse({ session: ended ? null : current }));
        fake.on('GET', '/exercises', () => jsonResponse([benchPress, squat]));
        fake.on('GET', '/stats/signals', () => jsonResponse(signals));
        fake.on('POST', `/sessions/${activeSession.id}/end`, () => {
          ended = true;
          return jsonResponse({
            id: activeSession.id,
            startedAt: activeSession.startedAt,
            endedAt: new Date().toISOString(),
            notes: null,
          });
        });
        serveNotice(fake);
      },
    });

    await waitFor(() => {
      expect(noticeRequests(fake)).toHaveLength(1);
    });
    await user.click(await screen.findByRole('button', { name: 'Terminar sesión' }));
    await user.click(screen.getAllByRole('button', { name: 'Terminar sesión' })[1] as HTMLElement);

    expect(await screen.findByRole('heading', { name: /Hola/ })).toBeInTheDocument();
    await waitFor(() => {
      expect(noticeRequests(fake).map((request) => request.method)).toEqual(['PUT', 'DELETE']);
    });
  });
});
