import { describe, expect, it, vi } from 'vitest';
import {
  clearMediaFiles,
  forgetMediaFile,
  loadMediaFile,
  mediaFilesToEvict,
  saveMediaFile,
  type MediaFileCache,
} from '../../src/offline/media-file-cache';
import {
  createMemoryMediaFileStore,
  type MediaFileStore,
  type MediaFileUsage,
} from '../../src/offline/media-file-store';

const NOW = new Date('2026-09-17T18:00:00.000Z');

function usage(mediaId: string, bytes: number, lastUsedAt: number): MediaFileUsage {
  return { mediaId, bytes, lastUsedAt };
}

function cacheWith(store: MediaFileStore, budgetBytes = 100): MediaFileCache {
  return { store, now: () => NOW, budgetBytes };
}

function failing(operation: keyof MediaFileStore): MediaFileStore {
  const store = createMemoryMediaFileStore();
  return { ...store, [operation]: () => Promise.reject(new Error(`${operation} falla`)) };
}

function silenceErrors() {
  return vi.spyOn(console, 'error').mockImplementation(() => undefined);
}

describe('mediaFilesToEvict', () => {
  it('no retira nada si el nuevo cabe', () => {
    expect(mediaFilesToEvict([usage('a', 40, 1)], { mediaId: 'b', bytes: 60 }, 100)).toEqual([]);
  });

  it('retira primero lo que más tiempo lleva sin mirarse, solo hasta que quepa', () => {
    const stored = [usage('reciente', 30, 30), usage('viejo', 30, 10), usage('medio', 30, 20)];

    expect(mediaFilesToEvict(stored, { mediaId: 'nuevo', bytes: 40 }, 100)).toEqual(['viejo']);
    expect(mediaFilesToEvict(stored, { mediaId: 'nuevo', bytes: 70 }, 100)).toEqual([
      'viejo',
      'medio',
    ]);
  });

  it('a igual uso decide el id, para que el resultado no dependa del orden de lectura', () => {
    const stored = [usage('b', 50, 5), usage('a', 50, 5)];

    expect(mediaFilesToEvict(stored, { mediaId: 'c', bytes: 50 }, 100)).toEqual(['a']);
  });

  it('el que ya estaba guardado no cuenta dos veces ni se retira a sí mismo', () => {
    const stored = [usage('video', 80, 1), usage('foto', 20, 2)];

    expect(mediaFilesToEvict(stored, { mediaId: 'video', bytes: 80 }, 100)).toEqual([]);
  });

  it('uno más grande que todo el espacio no se guarda y no retira nada', () => {
    expect(mediaFilesToEvict([usage('a', 10, 1)], { mediaId: 'b', bytes: 101 }, 100)).toBeNull();
  });
});

describe('loadMediaFile', () => {
  it('lo guardado se devuelve sin descargar y se apunta que se ha mirado', async () => {
    const store = createMemoryMediaFileStore();
    const saved = new Blob(['mp4'], { type: 'video/mp4' });
    await store.write('video', saved, 1);
    const download = vi.fn(() => Promise.reject(new Error('sin red')));

    const file = await loadMediaFile(cacheWith(store), 'video', download);

    expect(file).toBe(saved);
    expect(download).not.toHaveBeenCalled();
    expect(await store.usage()).toEqual([usage('video', 3, NOW.getTime())]);
  });

  it('lo que no está se descarga y se guarda para la próxima vez', async () => {
    const store = createMemoryMediaFileStore();
    const downloaded = new Blob(['jpeg'], { type: 'image/jpeg' });

    const file = await loadMediaFile(cacheWith(store), 'foto', () => Promise.resolve(downloaded));

    expect(file).toBe(downloaded);
    expect(await store.read('foto')).toBe(downloaded);
  });

  it('si el almacén no se puede leer, descarga igual', async () => {
    const logged = silenceErrors();
    const downloaded = new Blob(['jpeg'], { type: 'image/jpeg' });

    const file = await loadMediaFile(cacheWith(failing('read')), 'foto', () =>
      Promise.resolve(downloaded),
    );

    expect(file).toBe(downloaded);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it('si apuntar el uso falla, lo guardado se enseña igual', async () => {
    const logged = silenceErrors();
    const store = failing('markUsed');
    const saved = new Blob(['mp4'], { type: 'video/mp4' });
    await store.write('video', saved, 1);

    const file = await loadMediaFile(cacheWith(store), 'video', () =>
      Promise.reject(new Error('sin red')),
    );

    expect(file).toBe(saved);
    logged.mockRestore();
  });

  it('si no se puede guardar (cuota llena), lo descargado se enseña igual', async () => {
    const logged = silenceErrors();
    const downloaded = new Blob(['mp4'], { type: 'video/mp4' });

    const file = await loadMediaFile(cacheWith(failing('write')), 'video', () =>
      Promise.resolve(downloaded),
    );

    expect(file).toBe(downloaded);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it('sin red y sin nada guardado, falla con el error de la descarga', async () => {
    await expect(
      loadMediaFile(cacheWith(createMemoryMediaFileStore()), 'video', () =>
        Promise.reject(new TypeError('Failed to fetch')),
      ),
    ).rejects.toThrow('Failed to fetch');
  });
});

describe('saveMediaFile', () => {
  it('hace sitio retirando lo menos mirado antes de guardar', async () => {
    const store = createMemoryMediaFileStore();
    await store.write('viejo', new Blob(['x'.repeat(60)]), 1);
    await store.write('reciente', new Blob(['x'.repeat(30)]), 2);

    await saveMediaFile(cacheWith(store), 'nuevo', new Blob(['x'.repeat(50)]));

    expect([...store.mediaIds()].sort()).toEqual(['nuevo', 'reciente']);
  });

  it('lo que no cabe ni vaciando no se guarda y no retira nada', async () => {
    const logged = silenceErrors();
    const store = createMemoryMediaFileStore();
    await store.write('foto', new Blob(['x'.repeat(10)]), 1);

    await saveMediaFile(cacheWith(store), 'enorme', new Blob(['x'.repeat(101)]));

    expect(store.mediaIds()).toEqual(['foto']);
    logged.mockRestore();
  });
});

describe('forgetMediaFile y clearMediaFiles', () => {
  it('retiran lo guardado', async () => {
    const store = createMemoryMediaFileStore();
    await store.write('foto', new Blob(['jpeg']), 1);
    await store.write('video', new Blob(['mp4']), 2);

    await forgetMediaFile(cacheWith(store), 'foto');
    expect(store.mediaIds()).toEqual(['video']);

    await clearMediaFiles(cacheWith(store));
    expect(store.mediaIds()).toEqual([]);
  });

  it('un almacén que falla no tumba a quien los llama', async () => {
    const logged = silenceErrors();

    await expect(forgetMediaFile(cacheWith(failing('remove')), 'foto')).resolves.toBeUndefined();
    await expect(clearMediaFiles(cacheWith(failing('clear')))).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalledTimes(2);
    logged.mockRestore();
  });
});
