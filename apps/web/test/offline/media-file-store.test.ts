import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import {
  createIndexedDbMediaFileStore,
  createMemoryMediaFileStore,
  type MediaFileStore,
} from '../../src/offline/media-file-store';

const PHOTO_ID = '5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f';
const VIDEO_ID = '6d7e8f9a-0b1c-4d2e-9f3a-4b5c6d7e8f9a';

async function textOf(blob: Blob | null): Promise<string | null> {
  return blob === null ? null : new TextDecoder().decode(await blob.arrayBuffer());
}

function behavesAsAMediaFileStore(name: string, create: () => MediaFileStore): void {
  describe(name, () => {
    it('devuelve el fichero guardado con su tipo, y null si no está', async () => {
      const store = create();
      await store.write(VIDEO_ID, new Blob(['mp4-convertido'], { type: 'video/mp4' }), 1_000);

      const saved = await store.read(VIDEO_ID);

      expect(saved?.type).toBe('video/mp4');
      expect(await textOf(saved)).toBe('mp4-convertido');
      expect(await store.read(PHOTO_ID)).toBeNull();
    });

    it('lleva la cuenta de lo que ocupa cada uno y de cuándo se miró', async () => {
      const store = create();
      await store.write(PHOTO_ID, new Blob(['jpeg'], { type: 'image/jpeg' }), 1_000);
      await store.write(VIDEO_ID, new Blob(['mp4-convertido'], { type: 'video/mp4' }), 2_000);
      await store.markUsed(PHOTO_ID, 3_000);

      const usage = [...(await store.usage())].sort((left, right) =>
        left.mediaId.localeCompare(right.mediaId),
      );

      expect(usage).toEqual([
        { mediaId: PHOTO_ID, bytes: 4, lastUsedAt: 3_000 },
        { mediaId: VIDEO_ID, bytes: 14, lastUsedAt: 2_000 },
      ]);
    });

    it('apuntar el uso de lo que no está no lo crea', async () => {
      const store = create();

      await store.markUsed(VIDEO_ID, 1_000);

      expect(await store.usage()).toEqual([]);
      expect(await store.read(VIDEO_ID)).toBeNull();
    });

    it('guardar otra vez el mismo id lo sustituye', async () => {
      const store = create();
      await store.write(PHOTO_ID, new Blob(['jpeg'], { type: 'image/jpeg' }), 1_000);
      await store.write(PHOTO_ID, new Blob(['jpeg-nuevo'], { type: 'image/jpeg' }), 2_000);

      expect(await textOf(await store.read(PHOTO_ID))).toBe('jpeg-nuevo');
      expect(await store.usage()).toEqual([{ mediaId: PHOTO_ID, bytes: 10, lastUsedAt: 2_000 }]);
    });

    it('retirar deja los demás, retirar lo que no está no falla y vaciar lo quita todo', async () => {
      const store = create();
      await store.write(PHOTO_ID, new Blob(['jpeg'], { type: 'image/jpeg' }), 1_000);
      await store.write(VIDEO_ID, new Blob(['mp4'], { type: 'video/mp4' }), 2_000);

      await store.remove([PHOTO_ID, 'no-existe']);
      await store.remove([]);

      expect(await store.read(PHOTO_ID)).toBeNull();
      expect(await store.usage()).toEqual([{ mediaId: VIDEO_ID, bytes: 3, lastUsedAt: 2_000 }]);

      await store.clear();

      expect(await store.read(VIDEO_ID)).toBeNull();
      expect(await store.usage()).toEqual([]);
    });
  });
}

behavesAsAMediaFileStore('almacén de medios en memoria', () => createMemoryMediaFileStore());
behavesAsAMediaFileStore('almacén de medios en IndexedDB', () =>
  createIndexedDbMediaFileStore(new IDBFactory()),
);

describe('almacén de medios en IndexedDB', () => {
  it('lo guardado sobrevive a cerrar la app: otra instancia sobre la misma base lo lee', async () => {
    const factory = new IDBFactory();
    await createIndexedDbMediaFileStore(factory).write(
      VIDEO_ID,
      new Blob(['mp4'], { type: 'video/mp4' }),
      1_000,
    );

    const reopened = createIndexedDbMediaFileStore(factory);

    expect(await textOf(await reopened.read(VIDEO_ID))).toBe('mp4');
  });

  it('ignora lo guardado que no se puede leer en vez de fallar', async () => {
    const factory = new IDBFactory();
    const store = createIndexedDbMediaFileStore(factory);
    await store.write(PHOTO_ID, new Blob(['jpeg'], { type: 'image/jpeg' }), 1_000);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open('gymbuddy-media', 1);
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(request.error ?? new Error('no abre'));
      };
    });
    const transaction = db.transaction(['files', 'usage'], 'readwrite');
    transaction
      .objectStore('files')
      .put({ mediaId: VIDEO_ID, contentType: 'video/mp4', data: 'x' });
    transaction.objectStore('usage').put({ mediaId: VIDEO_ID, bytes: -1, lastUsedAt: 'ayer' });
    await new Promise((resolve) => {
      transaction.oncomplete = resolve;
    });
    db.close();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(await store.read(VIDEO_ID)).toBeNull();
    expect(await store.usage()).toEqual([{ mediaId: PHOTO_ID, bytes: 4, lastUsedAt: 1_000 }]);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
