import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '../../src/api/queries';
import type { StorageLike } from '../../src/lib/storage';
import {
  clearDeviceSnapshot,
  persistDeviceSnapshot,
  restoreDeviceSnapshot,
  SNAPSHOT_ENTRIES,
  snapshotStorageKey,
} from '../../src/offline/device-snapshot';
import { activeSession, benchPress, signals, squat, user } from '../fixtures';

const OTHER_USER_ID = '0de48f60-9b12-4d34-8f50-7b8c9d0e1f2a';
const SAVED_AT = '2026-09-08T18:15:00.000Z';

const [activeEntry, exercisesEntry] = SNAPSHOT_ENTRIES as [
  (typeof SNAPSHOT_ENTRIES)[number],
  (typeof SNAPSHOT_ENTRIES)[number],
];
const ACTIVE_KEY = snapshotStorageKey(activeEntry);
const EXERCISES_KEY = snapshotStorageKey(exercisesEntry);

function memoryStorage(initial: Record<string, string> = {}): StorageLike & {
  readonly data: Map<string, string>;
} {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

function stored(data: unknown, userId: string = user.id, savedAt = SAVED_AT): string {
  return JSON.stringify({ userId, savedAt, data });
}

const clients: QueryClient[] = [];

function newClient(): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return client;
}

afterEach(() => {
  clients.splice(0).forEach((client) => {
    client.clear();
  });
  vi.restoreAllMocks();
});

describe('restoreDeviceSnapshot', () => {
  it('mete en la caché lo guardado de la cuenta con la hora a la que respondió el Worker', () => {
    const client = newClient();
    const storage = memoryStorage({
      [ACTIVE_KEY]: stored({ session: activeSession }),
      [EXERCISES_KEY]: stored([benchPress, squat]),
    });

    expect(restoreDeviceSnapshot(client, storage, user.id)).toBe(2);

    expect(client.getQueryData(queryKeys.sessions.active)).toEqual({ session: activeSession });
    expect(client.getQueryData(queryKeys.exercises.list({ includeArchived: true }))).toEqual([
      benchPress,
      squat,
    ]);
    // Vieja a propósito: la pantalla la pinta y la relee en cuanto se monta.
    expect(client.getQueryState(queryKeys.sessions.active)?.dataUpdatedAt).toBe(
      Date.parse(SAVED_AT),
    );
  });

  it('lo de otra cuenta ni entra ni se queda en el móvil', () => {
    const client = newClient();
    const storage = memoryStorage({
      [ACTIVE_KEY]: stored({ session: activeSession }, OTHER_USER_ID),
    });

    expect(restoreDeviceSnapshot(client, storage, user.id)).toBe(0);

    expect(client.getQueryData(queryKeys.sessions.active)).toBeUndefined();
    expect(storage.data.has(ACTIVE_KEY)).toBe(false);
  });

  it('descarta lo que no cumple el contrato o no es JSON', () => {
    const client = newClient();
    const storage = memoryStorage({
      [ACTIVE_KEY]: stored({ session: { ...activeSession, startedAt: 'ayer' } }),
      [EXERCISES_KEY]: '{roto',
    });

    expect(restoreDeviceSnapshot(client, storage, user.id)).toBe(0);

    expect(client.getQueryData(queryKeys.sessions.active)).toBeUndefined();
    expect(storage.data.size).toBe(0);
  });

  it('no pisa lo que la caché ya tiene, que siempre es más nuevo', () => {
    const client = newClient();
    client.setQueryData(queryKeys.sessions.active, { session: null });
    const storage = memoryStorage({ [ACTIVE_KEY]: stored({ session: activeSession }) });

    expect(restoreDeviceSnapshot(client, storage, user.id)).toBe(0);

    expect(client.getQueryData(queryKeys.sessions.active)).toEqual({ session: null });
  });

  it('un almacenamiento que lanza al leer deja la caché vacía sin romper', () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const client = newClient();
    const storage: StorageLike = {
      getItem: () => {
        throw new Error('modo privado');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };

    expect(restoreDeviceSnapshot(client, storage, user.id)).toBe(0);
    expect(warned).toHaveBeenCalled();
  });
});

describe('persistDeviceSnapshot', () => {
  it('guarda cada respuesta buena de las lecturas elegidas, atada a la cuenta', async () => {
    const client = newClient();
    const storage = memoryStorage();
    const stop = persistDeviceSnapshot(client, storage, user.id);

    await client.fetchQuery({
      queryKey: queryKeys.sessions.active,
      queryFn: () => Promise.resolve({ session: activeSession }),
    });

    const saved = JSON.parse(storage.data.get(ACTIVE_KEY) ?? 'null') as {
      userId: string;
      savedAt: string;
      data: unknown;
    };
    expect(saved.userId).toBe(user.id);
    expect(saved.data).toEqual({ session: activeSession });
    expect(Date.parse(saved.savedAt)).toBe(
      client.getQueryState(queryKeys.sessions.active)?.dataUpdatedAt,
    );
    stop();
  });

  it('lo guardado se restaura igual en otra caché', async () => {
    const storage = memoryStorage();
    const first = newClient();
    const stop = persistDeviceSnapshot(first, storage, user.id);
    await first.fetchQuery({
      queryKey: queryKeys.stats.signals,
      queryFn: () => Promise.resolve(signals),
    });
    stop();

    const second = newClient();
    expect(restoreDeviceSnapshot(second, storage, user.id)).toBe(1);
    expect(second.getQueryData(queryKeys.stats.signals)).toEqual(signals);
  });

  it('ni las lecturas que no hacen falta sin red ni los fallos se guardan', async () => {
    const client = newClient();
    const storage = memoryStorage();
    const stop = persistDeviceSnapshot(client, storage, user.id);

    await client.fetchQuery({
      queryKey: queryKeys.exercises.list({}),
      queryFn: () => Promise.resolve([benchPress]),
    });
    const observer = new QueryObserver(client, {
      queryKey: queryKeys.sessions.active,
      queryFn: () => Promise.reject(new Error('sin red')),
    });
    await observer.refetch();

    expect(storage.data.size).toBe(0);
    stop();
  });

  it('al dejar de guardar, lo que llega después no se escribe', async () => {
    const client = newClient();
    const storage = memoryStorage();
    persistDeviceSnapshot(client, storage, user.id)();

    await client.fetchQuery({
      queryKey: queryKeys.sessions.active,
      queryFn: () => Promise.resolve({ session: null }),
    });

    expect(storage.data.size).toBe(0);
  });

  it('un almacenamiento lleno se avisa en consola y la lectura sigue en la caché', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const client = newClient();
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => undefined,
    };
    const stop = persistDeviceSnapshot(client, storage, user.id);

    await client.fetchQuery({
      queryKey: queryKeys.sessions.active,
      queryFn: () => Promise.resolve({ session: null }),
    });

    expect(warned).toHaveBeenCalled();
    expect(client.getQueryData(queryKeys.sessions.active)).toEqual({ session: null });
    stop();
  });
});

describe('clearDeviceSnapshot', () => {
  it('borra todas las lecturas guardadas y deja lo demás', () => {
    const storage = memoryStorage({
      ...Object.fromEntries(
        SNAPSHOT_ENTRIES.map((entry) => [snapshotStorageKey(entry), stored(null)]),
      ),
      'gymbuddy.session': '{}',
    });

    clearDeviceSnapshot(storage);

    expect([...storage.data.keys()]).toEqual(['gymbuddy.session']);
  });
});
