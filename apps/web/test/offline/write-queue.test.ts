import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError, ApiTransportError } from '../../src/api/client';
import type { PendingWrite, SessionWrite } from '../../src/offline/pending-write';
import { WriteQueue, type DrainReport } from '../../src/offline/write-queue';
import {
  createMemoryWriteQueueStore,
  type MemoryWriteQueueStore,
} from '../../src/offline/write-queue-store';
import { activeSession, benchPress, user } from '../fixtures';

const OTHER_USER_ID = '5e9f3a1b-4c6d-4e8f-9a0b-2c3d4e5f6a7b';
const NOW = new Date('2026-09-08T18:30:00.000Z');

function logSet(id: string): SessionWrite {
  return {
    kind: 'log_set',
    sessionId: activeSession.id,
    body: {
      id,
      trackedExerciseId: benchPress.id,
      weight: '80.00',
      reps: 8,
      completedAt: NOW.toISOString(),
    },
  };
}

const SET_A = logSet('6fa04b2c-5d7e-4f90-8b1c-3d4e5f6a7b8c');
const SET_B = logSet('7ab15c3d-6e8f-4a01-9c2d-4e5f6a7b8c9d');
const SET_C = logSet('8bc26d4e-7f90-4b12-8d3e-5f6a7b8c9d0e');

interface Harness {
  readonly queue: WriteQueue;
  readonly store: MemoryWriteQueueStore;
  readonly sent: SessionWrite[];
  readonly reports: DrainReport[];
  /** Lo que responde el Worker falso a cada envío, en orden; sin respuesta, acepta. */
  readonly failures: (Error | null)[];
}

function harness(saved: readonly unknown[] = [], userId = user.id): Harness {
  const store = createMemoryWriteQueueStore(saved);
  const queue = new WriteQueue({ store, now: () => NOW });
  const sent: SessionWrite[] = [];
  const reports: DrainReport[] = [];
  const failures: (Error | null)[] = [];
  queue.connect({
    userId,
    send: (write) => {
      sent.push(write);
      const failure = failures.shift() ?? null;
      return failure === null ? Promise.resolve(null) : Promise.reject(failure);
    },
    onSettled: (report) => {
      reports.push(report);
    },
  });
  return { queue, store, sent, reports, failures };
}

function saved(sequence: number, write: SessionWrite, userId = user.id): PendingWrite {
  return { sequence, userId, queuedAt: NOW.toISOString(), write };
}

describe('WriteQueue: pedir una escritura', () => {
  it('con red y nada pendiente sale directa y devuelve la respuesta del Worker', async () => {
    const { queue, store } = harness();

    const outcome = await queue.submit(SET_A, () => Promise.resolve('respuesta'));

    expect(outcome).toEqual({ status: 'sent', response: 'respuesta' });
    expect(queue.getSnapshot().pending).toEqual([]);
    expect(store.entries()).toEqual([]);
  });

  it('sin red se guarda en el dispositivo con la cuenta y la hora, y avisa a quien escucha', async () => {
    const { queue, store } = harness();
    const listener = vi.fn();
    queue.subscribe(listener);

    const outcome = await queue.submit(SET_A, () =>
      Promise.reject(new ApiTransportError('sin red')),
    );

    expect(outcome).toEqual({ status: 'queued' });
    expect(queue.getSnapshot().pending).toEqual([saved(0, SET_A)]);
    expect(store.entries()).toEqual([saved(0, SET_A)]);
    expect(listener).toHaveBeenCalled();
  });

  it('un rechazo del Worker no se encola: se lanza para que la pantalla lo enseñe', async () => {
    const { queue } = harness();
    const rejection = new ApiRequestError('session_closed', 409, 'Cerrada');

    await expect(queue.submit(SET_A, () => Promise.reject(rejection))).rejects.toBe(rejection);
    expect(queue.getSnapshot().pending).toEqual([]);
  });

  it('con algo esperando delante no adelanta: se encola detrás y se drena en orden', async () => {
    const { queue, sent } = harness();
    await queue.submit(SET_A, () => Promise.reject(new ApiTransportError('sin red')));
    const direct = vi.fn(() => Promise.resolve('no debería salir'));

    const outcome = await queue.submit(SET_B, direct);
    await queue.drain();

    expect(outcome).toEqual({ status: 'queued' });
    expect(direct).not.toHaveBeenCalled();
    expect(sent).toEqual([SET_A, SET_B]);
    expect(queue.getSnapshot().pending).toEqual([]);
  });

  it('sin cuenta conectada no se puede escribir', async () => {
    const queue = new WriteQueue({ store: createMemoryWriteQueueStore() });

    await expect(queue.submit(SET_A, () => Promise.resolve(null))).rejects.toThrow('sin sesión');
  });
});

describe('WriteQueue: drenar', () => {
  it('manda lo guardado al abrir la app, en orden, lo retira y avisa de lo que entró', async () => {
    const { queue, store, sent, reports } = harness([saved(4, SET_B), saved(1, SET_A)]);

    const report = await queue.drain();

    expect(sent).toEqual([SET_A, SET_B]);
    expect(report).toEqual({ sent: 2, dropped: 0 });
    expect(reports).toEqual([{ sent: 2, dropped: 0 }]);
    expect(store.entries()).toEqual([]);
  });

  it('se para en el primer fallo de red y deja ese y lo de detrás para la próxima', async () => {
    const { queue, sent, failures, reports } = harness([
      saved(0, SET_A),
      saved(1, SET_B),
      saved(2, SET_C),
    ]);
    failures.push(null, new ApiTransportError('se fue la red'));

    const report = await queue.drain();

    expect(sent).toEqual([SET_A, SET_B]);
    expect(report).toEqual({ sent: 1, dropped: 0 });
    expect(queue.getSnapshot().pending.map((entry) => entry.write)).toEqual([SET_B, SET_C]);
    expect(reports).toEqual([{ sent: 1, dropped: 0 }]);
  });

  it('sin nada que mandar no avisa de nada', async () => {
    const { queue, reports } = harness();

    expect(await queue.drain()).toEqual({ sent: 0, dropped: 0 });
    expect(reports).toEqual([]);
  });

  it('retira con aviso lo que el Worker rechaza y sigue con lo de detrás', async () => {
    const { queue, sent, failures } = harness([saved(0, SET_A), saved(1, SET_B)]);
    const closed = new ApiRequestError('session_closed', 409, 'Cerrada');
    failures.push(closed);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const report = await queue.drain();

    expect(sent).toEqual([SET_A, SET_B]);
    expect(report).toEqual({ sent: 1, dropped: 1 });
    expect(queue.getSnapshot().pending).toEqual([]);
    expect(queue.getSnapshot().dropped).toEqual([
      { sequence: 0, userId: user.id, write: SET_A, error: closed },
    ]);
    expect(logged).toHaveBeenCalled();

    queue.dismiss(0);
    expect(queue.getSnapshot().dropped).toEqual([]);
    logged.mockRestore();
  });

  it('con la sesión caducada no descarta nada: espera a que se vuelva a entrar', async () => {
    const { queue, failures } = harness([saved(0, SET_A)]);
    failures.push(new ApiRequestError('unauthorized', 401, 'Caducada'));

    await queue.drain();

    expect(queue.getSnapshot().pending).toHaveLength(1);
    expect(queue.getSnapshot().dropped).toEqual([]);
  });

  it('no manda lo que registró otra cuenta en el mismo móvil', async () => {
    const { queue, sent } = harness([saved(0, SET_A, OTHER_USER_ID), saved(1, SET_B)]);

    await queue.drain();

    expect(sent).toEqual([SET_B]);
    expect(queue.getSnapshot().pending).toEqual([saved(0, SET_A, OTHER_USER_ID)]);
  });

  it('dos drenados a la vez mandan cada escritura una sola vez', async () => {
    const { queue, sent } = harness([saved(0, SET_A), saved(1, SET_B)]);

    const [first, second] = await Promise.all([queue.drain(), queue.drain()]);

    expect(first).toBe(second);
    expect(sent).toEqual([SET_A, SET_B]);
  });

  it('una entrada ilegible no se manda, y su secuencia no la pisa lo que se encole después', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken = { sequence: 5, userId: user.id, write: { kind: 'otra_cosa' } };
    const { queue, store, sent } = harness([broken]);

    await queue.submit(SET_A, () => Promise.reject(new ApiTransportError('sin red')));

    expect(sent).toEqual([]);
    expect(store.entries()).toEqual([broken, saved(6, SET_A)]);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it('si el dispositivo no deja guardar, la escritura sigue en memoria y se manda igual', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const store = createMemoryWriteQueueStore();
    store.put = () => Promise.reject(new Error('Sin cuota'));
    const queue = new WriteQueue({ store, now: () => NOW });
    const sent: SessionWrite[] = [];
    queue.connect({
      userId: user.id,
      send: (write) => {
        sent.push(write);
        return Promise.resolve(null);
      },
      onSettled: () => undefined,
    });

    await queue.submit(SET_A, () => Promise.reject(new ApiTransportError('sin red')));
    expect(queue.getSnapshot().pending).toHaveLength(1);
    await queue.drain();

    expect(sent).toEqual([SET_A]);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it('desconectada, la cola no drena', async () => {
    const { queue, sent } = harness([saved(0, SET_A)]);
    const again = new WriteQueue({ store: createMemoryWriteQueueStore([saved(0, SET_A)]) });
    const disconnect = again.connect({
      userId: user.id,
      send: (write) => {
        sent.push(write);
        return Promise.resolve(null);
      },
      onSettled: () => undefined,
    });

    disconnect();
    await again.drain();

    expect(sent).toEqual([]);
    expect(queue.getSnapshot().pending).toHaveLength(1);
  });
});
