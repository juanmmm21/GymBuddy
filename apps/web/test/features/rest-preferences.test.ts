import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_REST_PREFERENCES } from '../../src/features/session/rest';
import {
  REST_PREFERENCES_STORAGE_KEY,
  loadRestPreferences,
  saveRestPreferences,
} from '../../src/features/session/rest-preferences-store';
import type { StorageLike } from '../../src/lib/storage';

function memoryStorage(
  initial: Record<string, string> = {},
): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

describe('descanso recordado en el dispositivo', () => {
  it('sin nada guardado usa los de por defecto', () => {
    expect(loadRestPreferences(memoryStorage())).toEqual(DEFAULT_REST_PREFERENCES);
  });

  it('lo guardado se recupera tal cual', () => {
    const storage = memoryStorage();
    saveRestPreferences(storage, { setSeconds: 90, exerciseSeconds: 300 });

    expect(loadRestPreferences(storage)).toEqual({ setSeconds: 90, exerciseSeconds: 300 });
  });

  it('un valor que ya no se ofrece vuelve al de por defecto solo en ese campo', () => {
    const storage = memoryStorage({
      [REST_PREFERENCES_STORAGE_KEY]: JSON.stringify({ setSeconds: 45, exerciseSeconds: 240 }),
    });

    expect(loadRestPreferences(storage)).toEqual({
      setSeconds: DEFAULT_REST_PREFERENCES.setSeconds,
      exerciseSeconds: 240,
    });
  });

  it('un JSON roto o un almacenamiento que lanza no rompen la sesión', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(loadRestPreferences(memoryStorage({ [REST_PREFERENCES_STORAGE_KEY]: '{roto' }))).toEqual(
      DEFAULT_REST_PREFERENCES,
    );

    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('modo privado');
      },
      setItem: () => {
        throw new Error('modo privado');
      },
      removeItem: () => undefined,
    };
    expect(loadRestPreferences(throwing)).toEqual(DEFAULT_REST_PREFERENCES);
    expect(() => {
      saveRestPreferences(throwing, DEFAULT_REST_PREFERENCES);
    }).not.toThrow();
  });
});
