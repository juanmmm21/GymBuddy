import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { PendingWrite } from '../../src/offline/pending-write';
import {
  createIndexedDbWriteQueueStore,
  createMemoryWriteQueueStore,
  type WriteQueueStore,
} from '../../src/offline/write-queue-store';
import { activeSession, user } from '../fixtures';

function entry(sequence: number): PendingWrite {
  return {
    sequence,
    userId: user.id,
    queuedAt: '2026-09-08T18:30:00.000Z',
    write: {
      kind: 'remove_set',
      sessionId: activeSession.id,
      setId: activeSession.sets[0]?.id ?? activeSession.id,
    },
  };
}

function behavesAsAQueueStore(name: string, create: () => WriteQueueStore): void {
  describe(name, () => {
    it('devuelve lo guardado en orden de secuencia aunque se guardase desordenado', async () => {
      const store = create();
      await store.put(entry(2));
      await store.put(entry(0));
      await store.put(entry(1));

      const loaded = await store.loadAll();

      expect(loaded.map((saved) => (saved as PendingWrite).sequence)).toEqual([0, 1, 2]);
    });

    it('retirar una entrada deja las demás, y retirar lo que no está no falla', async () => {
      const store = create();
      await store.put(entry(0));
      await store.put(entry(1));

      await store.remove(0);
      await store.remove(7);

      expect(await store.loadAll()).toEqual([entry(1)]);
    });

    it('guardar otra vez la misma secuencia la sustituye', async () => {
      const store = create();
      await store.put(entry(0));
      await store.put({ ...entry(0), queuedAt: '2026-09-08T19:00:00.000Z' });

      expect(await store.loadAll()).toEqual([
        { ...entry(0), queuedAt: '2026-09-08T19:00:00.000Z' },
      ]);
    });
  });
}

behavesAsAQueueStore('almacén en memoria', () => createMemoryWriteQueueStore());
behavesAsAQueueStore('almacén en IndexedDB', () =>
  createIndexedDbWriteQueueStore(new IDBFactory()),
);

describe('almacén en IndexedDB', () => {
  it('lo guardado sobrevive a cerrar la app: otro almacén sobre la misma base lo lee', async () => {
    const factory = new IDBFactory();
    await createIndexedDbWriteQueueStore(factory).put(entry(3));

    expect(await createIndexedDbWriteQueueStore(factory).loadAll()).toEqual([entry(3)]);
  });

  it('si la base no se puede abrir, falla la operación y la siguiente lo vuelve a intentar', async () => {
    let attempts = 0;
    const real = new IDBFactory();
    const flaky = {
      open: (name: string, version?: number) => {
        attempts += 1;
        if (attempts === 1) throw new Error('Sin cuota');
        return real.open(name, version);
      },
    } as unknown as IDBFactory;
    const store = createIndexedDbWriteQueueStore(flaky);

    await expect(store.loadAll()).rejects.toThrow('Sin cuota');
    await store.put(entry(0));

    expect(await store.loadAll()).toEqual([entry(0)]);
  });
});
