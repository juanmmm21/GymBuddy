import { describe, expect, it, vi } from 'vitest';
import {
  TUTORIAL_STEPS,
  TUTORIAL_STORAGE_KEY,
  isTutorialVisible,
  loadTutorialSeen,
  saveTutorialSeen,
} from '../../src/features/tutorial/tutorial';
import type { StorageLike } from '../../src/lib/storage';

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

describe('pasos del tutorial', () => {
  it('cubre las cuatro pestañas y lo que se hace entrenando, sin ids repetidos', () => {
    expect(TUTORIAL_STEPS.map((step) => step.id)).toEqual([
      'home',
      'session',
      'routines',
      'catalog',
      'settings',
    ]);
  });

  it('cada paso tiene título y texto', () => {
    for (const step of TUTORIAL_STEPS) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.body.length).toBeGreaterThan(0);
    }
  });
});

describe('isTutorialVisible', () => {
  it('sale solo la primera vez', () => {
    expect(isTutorialVisible({ mode: 'auto', seen: false, hasOpenSession: false })).toBe(true);
    expect(isTutorialVisible({ mode: 'auto', seen: true, hasOpenSession: false })).toBe(false);
  });

  it('no se pone delante de un entrenamiento en curso', () => {
    expect(isTutorialVisible({ mode: 'auto', seen: false, hasOpenSession: true })).toBe(false);
  });

  it('pedido a mano sale aunque ya se viera y aunque se esté entrenando', () => {
    expect(isTutorialVisible({ mode: 'open', seen: true, hasOpenSession: true })).toBe(true);
  });

  it('cerrado no vuelve en esta visita, ni siquiera sin haberse guardado', () => {
    expect(isTutorialVisible({ mode: 'closed', seen: false, hasOpenSession: false })).toBe(false);
  });
});

describe('preferencia del tutorial', () => {
  it('empieza sin ver y se recuerda al cerrarlo', () => {
    const storage = memoryStorage();
    expect(loadTutorialSeen(storage)).toBe(false);

    saveTutorialSeen(storage);
    expect(loadTutorialSeen(storage)).toBe(true);
    expect(storage.data.get(TUTORIAL_STORAGE_KEY)).toBe('{"seen":true}');
  });

  it('lo ilegible o con otra forma se da por visto: no se repite en cada arranque', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(loadTutorialSeen(memoryStorage({ [TUTORIAL_STORAGE_KEY]: '{' }))).toBe(true);
    expect(loadTutorialSeen(memoryStorage({ [TUTORIAL_STORAGE_KEY]: '{"seen":"sí"}' }))).toBe(true);
    warn.mockRestore();
  });

  it('un almacenamiento que no deja leer tampoco lo enseña', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('modo privado');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(loadTutorialSeen(broken)).toBe(true);
    warn.mockRestore();
  });

  it('un almacenamiento que no deja escribir no rompe el cierre', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const broken: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('sin cuota');
      },
      removeItem: () => undefined,
    };
    expect(() => saveTutorialSeen(broken)).not.toThrow();
    warn.mockRestore();
  });
});
