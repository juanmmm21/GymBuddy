import type {
  LogSetRequest,
  SetEntry,
  StartSessionRequest,
  WorkoutSessionDetail,
} from '@gymbuddy/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PendingWrite } from '../../src/offline/pending-write';
import { errorResponse, jsonResponse, type FakeFetch, type RecordedRequest } from '../fake-fetch';
import { activeSession, benchPress, session, squat, user } from '../fixtures';
import { renderApp } from './render-app';

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const QUEUED_SET_ID = '9cd37e5f-8a01-4c23-9e4f-6a7b8c9d0e1f';
const OTHER_USER_ID = '0de48f60-9b12-4d34-8f50-7b8c9d0e1f2a';

/** Un Worker en memoria que se queda sin red a voluntad: sin red, ninguna ruta responde. */
interface FakeWorker {
  online: boolean;
  session: WorkoutSessionDetail | null;
}

function serveWorker(fake: FakeFetch, worker: FakeWorker): void {
  const route = (
    method: string,
    path: string,
    handler: (request: RecordedRequest) => Response,
  ): void => {
    fake.on(method, path, (request) => {
      if (!worker.online) throw new TypeError('Failed to fetch');
      return handler(request);
    });
  };

  const serveSets = (sessionId: string): void => {
    route('POST', `/sessions/${sessionId}/sets`, (request) => {
      const body = request.body as LogSetRequest;
      const current = worker.session;
      if (current?.id !== sessionId) return errorResponse('session_closed', 409, 'Cerrada');
      const entry: SetEntry = {
        id: body.id,
        trackedExerciseId: body.trackedExerciseId,
        orderIndex: current.sets.length,
        weight: body.weight,
        reps: body.reps,
        rpe: body.rpe ?? null,
        isWarmup: body.isWarmup ?? false,
        completedAt: body.completedAt ?? new Date().toISOString(),
      };
      if (!current.sets.some((set) => set.id === entry.id)) {
        worker.session = { ...current, sets: [...current.sets, entry] };
      }
      return jsonResponse({ set: entry, records: [] });
    });
  };

  route('GET', '/sessions/active', () => jsonResponse({ session: worker.session }));
  route('GET', '/exercises', () => jsonResponse([benchPress, squat]));
  route('POST', '/sessions', (request) => {
    const body = request.body as StartSessionRequest;
    const opened: WorkoutSessionDetail = {
      id: body.id,
      startedAt: body.startedAt ?? new Date().toISOString(),
      endedAt: null,
      notes: null,
      sets: [],
    };
    worker.session = opened;
    serveSets(body.id);
    return jsonResponse({ ...opened, sets: undefined });
  });
  serveSets(activeSession.id);
}

function queuedSet(userId = user.id): PendingWrite {
  return {
    sequence: 0,
    userId,
    queuedAt: '2026-09-08T18:30:00.000Z',
    write: {
      kind: 'log_set',
      sessionId: activeSession.id,
      body: {
        id: QUEUED_SET_ID,
        trackedExerciseId: squat.id,
        weight: '100.00',
        reps: 5,
        completedAt: '2026-09-08T18:30:00.000Z',
      },
    },
  };
}

function setRequests(fake: FakeFetch): RecordedRequest[] {
  return fake.requests.filter(
    (request) => request.method === 'POST' && request.path.endsWith('/sets'),
  );
}

async function logDefaultSet(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Registrar serie' }));
  await user.click(screen.getAllByRole('button', { name: 'Registrar serie' })[1] as HTMLElement);
}

describe('sesión sin cobertura', () => {
  it('una serie sin red se ve pendiente, se guarda en el móvil y entra al reintentar', async () => {
    const actor = userEvent.setup();
    const worker: FakeWorker = { online: true, session: activeSession };
    const { fake, queueStore } = renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        serveWorker(fake, worker);
      },
    });
    await screen.findByRole('heading', { name: 'Press de banca' });
    worker.online = false;

    await logDefaultSet(actor);

    // La hoja se cierra como si hubiera entrado, y la serie se pinta marcada.
    expect(await screen.findByText('1 cambio sin sincronizar')).toBeInTheDocument();
    expect(screen.getAllByText('82,5 kg × 8')).toHaveLength(2);
    expect(screen.getByText('Sin sincronizar')).toBeInTheDocument();
    const [stored] = queueStore.entries() as PendingWrite[];
    expect(stored?.userId).toBe(user.id);
    expect(stored?.write).toMatchObject({
      kind: 'log_set',
      sessionId: activeSession.id,
      body: { trackedExerciseId: benchPress.id, weight: '82.50', reps: 8 },
    });
    expect(stored?.write.kind === 'log_set' && stored.write.body.completedAt).toMatch(ISO_INSTANT);

    worker.online = true;
    await actor.click(screen.getByRole('button', { name: 'Reintentar ahora' }));

    await waitFor(() => {
      expect(screen.queryByText('1 cambio sin sincronizar')).not.toBeInTheDocument();
    });
    // Mandada con el mismo id y la misma hora que al pulsar, y la sesión releída ya la trae.
    const [offlineAttempt, drained] = setRequests(fake);
    expect(drained?.body).toEqual(offlineAttempt?.body);
    await waitFor(() => {
      expect(screen.queryByText('Sin sincronizar')).not.toBeInTheDocument();
    });
    expect(worker.session?.sets).toHaveLength(2);
    expect(queueStore.entries()).toEqual([]);
  });

  it('empezar sin red abre la sesión en el móvil y al volver la red se manda todo en orden', async () => {
    const actor = userEvent.setup();
    const worker: FakeWorker = { online: true, session: null };
    const { fake, queueStore } = renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        serveWorker(fake, worker);
      },
    });
    await screen.findByRole('button', { name: 'Empezar a entrenar' });
    worker.online = false;

    await actor.click(screen.getByRole('button', { name: 'Empezar a entrenar' }));
    expect(await screen.findByText('Todavía no has registrado ninguna serie')).toBeInTheDocument();
    expect(screen.getByText('1 cambio sin sincronizar')).toBeInTheDocument();

    await logDefaultSet(actor);
    expect(await screen.findByText('2 cambios sin sincronizar')).toBeInTheDocument();

    worker.online = true;
    window.dispatchEvent(new Event('online'));

    await waitFor(() => {
      expect(queueStore.entries()).toEqual([]);
    });
    const drained = fake.requests.filter((request) => request.method === 'POST').slice(-2);
    const start = drained[0]?.body as StartSessionRequest;
    const logged = drained[1];
    expect(drained[0]?.path).toBe('/sessions');
    expect(start.startedAt).toMatch(ISO_INSTANT);
    expect(logged?.path).toBe(`/sessions/${start.id}/sets`);
    expect(worker.session?.sets).toHaveLength(1);
    await waitFor(() => {
      expect(screen.queryByText(/sin sincronizar/)).not.toBeInTheDocument();
    });
  });

  it('lo que quedó en la cola al cerrar la app se manda al abrirla', async () => {
    const worker: FakeWorker = { online: true, session: activeSession };
    const { fake, queueStore } = renderApp({
      path: '/session',
      session,
      queued: [queuedSet()],
      setup: (fake) => {
        serveWorker(fake, worker);
      },
    });

    await waitFor(() => {
      expect(queueStore.entries()).toEqual([]);
    });
    expect(setRequests(fake).map((request) => (request.body as LogSetRequest).id)).toEqual([
      QUEUED_SET_ID,
    ]);
    expect(await screen.findByText('100 kg × 5')).toBeInTheDocument();
  });

  it('una serie de una sesión que se cerró desde otro móvil se avisa y se retira', async () => {
    const actor = userEvent.setup();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const worker: FakeWorker = { online: true, session: null };
    const { queueStore } = renderApp({
      path: '/session',
      session,
      queued: [queuedSet()],
      setup: (fake) => {
        serveWorker(fake, worker);
      },
    });

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('No se guardó una serie')).toBeInTheDocument();
    expect(within(alert).getByText(/ya estaba cerrada/)).toBeInTheDocument();
    expect(queueStore.entries()).toEqual([]);

    await actor.click(within(alert).getByRole('button', { name: 'Entendido' }));

    expect(screen.queryByText('No se guardó una serie')).not.toBeInTheDocument();
    logged.mockRestore();
  });

  it('lo que registró otra cuenta en este móvil ni se enseña ni se manda', async () => {
    const worker: FakeWorker = { online: true, session: activeSession };
    const { fake, queueStore } = renderApp({
      path: '/session',
      session,
      queued: [queuedSet(OTHER_USER_ID)],
      setup: (fake) => {
        serveWorker(fake, worker);
      },
    });

    await screen.findByRole('heading', { name: 'Press de banca' });

    expect(screen.queryByText(/sin sincronizar/)).not.toBeInTheDocument();
    expect(screen.queryByText('100 kg × 5')).not.toBeInTheDocument();
    expect(setRequests(fake)).toEqual([]);
    expect(queueStore.entries()).toHaveLength(1);
  });

  it('reintentar dentro de la misma hoja repite la misma serie, no una nueva', async () => {
    const actor = userEvent.setup();
    let attempts = 0;
    const { fake } = renderApp({
      path: '/session',
      session,
      setup: (fake) => {
        fake.on('GET', '/sessions/active', () => jsonResponse({ session: activeSession }));
        fake.on('GET', '/exercises', () => jsonResponse([benchPress, squat]));
        fake.on('POST', `/sessions/${activeSession.id}/sets`, (request) => {
          attempts += 1;
          if (attempts === 1) return errorResponse('validation_failed', 400, 'Revisa el peso');
          const body = request.body as LogSetRequest;
          return jsonResponse({
            set: { ...activeSession.sets[0], id: body.id, orderIndex: 1 },
            records: [],
          });
        });
      },
    });
    await screen.findByRole('heading', { name: 'Press de banca' });

    await logDefaultSet(actor);
    expect(await screen.findByText('Revisa el peso')).toBeInTheDocument();
    await actor.click(screen.getAllByRole('button', { name: 'Registrar serie' })[1] as HTMLElement);

    await waitFor(() => {
      expect(setRequests(fake)).toHaveLength(2);
    });
    const [first, second] = setRequests(fake).map((request) => request.body as LogSetRequest);
    expect(second?.id).toBe(first?.id);
  });
});
