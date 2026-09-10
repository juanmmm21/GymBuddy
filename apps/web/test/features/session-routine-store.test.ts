import { describe, expect, it, vi } from 'vitest';
import {
  clearSessionRoutine,
  loadSessionRoutine,
  saveSessionRoutine,
  SESSION_ROUTINE_STORAGE_KEY,
} from '../../src/features/session/session-routine-store';
import type { StorageLike } from '../../src/lib/storage';
import { activeSession, pastSession, pushRoutine } from '../fixtures';

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

describe('session-routine-store', () => {
  it('recuerda qué rutina guía la sesión abierta', () => {
    const storage = memoryStorage();
    saveSessionRoutine(storage, { sessionId: activeSession.id, routineId: pushRoutine.id });

    expect(loadSessionRoutine(storage, activeSession.id)).toBe(pushRoutine.id);
  });

  it('sin nada guardado no hay rutina', () => {
    expect(loadSessionRoutine(memoryStorage(), activeSession.id)).toBeNull();
  });

  it('lo guardado para otra sesión no guía la abierta', () => {
    // La sesión de ayer se cerró desde el bot y hoy hay otra: la rutina de ayer ya no vale.
    const storage = memoryStorage();
    saveSessionRoutine(storage, { sessionId: pastSession.id, routineId: pushRoutine.id });

    expect(loadSessionRoutine(storage, activeSession.id)).toBeNull();
  });

  it('guardar otra rutina sustituye a la anterior', () => {
    const storage = memoryStorage();
    saveSessionRoutine(storage, { sessionId: pastSession.id, routineId: pushRoutine.id });
    saveSessionRoutine(storage, { sessionId: activeSession.id, routineId: pushRoutine.id });

    expect(storage.data.size).toBe(1);
    expect(loadSessionRoutine(storage, activeSession.id)).toBe(pushRoutine.id);
  });

  it('descarta y borra lo que no tiene la forma esperada', () => {
    const storage = memoryStorage({
      [SESSION_ROUTINE_STORAGE_KEY]: JSON.stringify({ sessionId: activeSession.id, routineId: 7 }),
    });

    expect(loadSessionRoutine(storage, activeSession.id)).toBeNull();
    expect(storage.data.has(SESSION_ROUTINE_STORAGE_KEY)).toBe(false);
  });

  it('descarta y borra un JSON roto', () => {
    const storage = memoryStorage({ [SESSION_ROUTINE_STORAGE_KEY]: '{no es json' });

    expect(loadSessionRoutine(storage, activeSession.id)).toBeNull();
    expect(storage.data.has(SESSION_ROUTINE_STORAGE_KEY)).toBe(false);
  });

  it('olvidarla la borra', () => {
    const storage = memoryStorage();
    saveSessionRoutine(storage, { sessionId: activeSession.id, routineId: pushRoutine.id });
    clearSessionRoutine(storage);

    expect(storage.data.has(SESSION_ROUTINE_STORAGE_KEY)).toBe(false);
  });

  it('un almacenamiento que lanza deja la sesión sin guía, no rota', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };

    expect(() => {
      saveSessionRoutine(broken, { sessionId: activeSession.id, routineId: pushRoutine.id });
    }).not.toThrow();
    expect(loadSessionRoutine(broken, activeSession.id)).toBeNull();
    expect(() => {
      clearSessionRoutine(broken);
    }).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });
});
