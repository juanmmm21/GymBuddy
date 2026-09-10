import { describe, expect, it, vi } from 'vitest';
import {
  clearStoredSession,
  loadStoredSession,
  saveStoredSession,
  SESSION_STORAGE_KEY,
} from '../../src/auth/session-store';
import type { StorageLike } from '../../src/lib/storage';
import { session } from '../fixtures';

function memoryStorage(
  initial: Record<string, string> = {},
): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const NOW = new Date('2026-09-08T12:00:00.000Z');

describe('session-store', () => {
  it('guarda y recupera la sesión', () => {
    const storage = memoryStorage();
    saveStoredSession(storage, session);
    expect(loadStoredSession(storage, NOW)).toEqual(session);
  });

  it('sin nada guardado devuelve null', () => {
    expect(loadStoredSession(memoryStorage(), NOW)).toBeNull();
  });

  it('descarta y borra lo que no cumple el contrato', () => {
    const storage = memoryStorage({ [SESSION_STORAGE_KEY]: JSON.stringify({ token: 'x' }) });
    expect(loadStoredSession(storage, NOW)).toBeNull();
    expect(storage.data.has(SESSION_STORAGE_KEY)).toBe(false);
  });

  it('descarta y borra un JSON roto', () => {
    const storage = memoryStorage({ [SESSION_STORAGE_KEY]: '{no es json' });
    expect(loadStoredSession(storage, NOW)).toBeNull();
    expect(storage.data.has(SESSION_STORAGE_KEY)).toBe(false);
  });

  it('una sesión caducada no vale aunque esté bien formada', () => {
    const storage = memoryStorage();
    saveStoredSession(storage, { ...session, expiresAt: '2026-09-08T11:59:59.000Z' });
    expect(loadStoredSession(storage, NOW)).toBeNull();
    expect(storage.data.has(SESSION_STORAGE_KEY)).toBe(false);
  });

  it('un almacenamiento que lanza no rompe la app', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('QuotaExceededError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };

    expect(loadStoredSession(broken, NOW)).toBeNull();
    expect(() => {
      saveStoredSession(broken, session);
    }).not.toThrow();
    expect(() => {
      clearStoredSession(broken);
    }).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });
});
