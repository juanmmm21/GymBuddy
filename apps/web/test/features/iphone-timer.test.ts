import { describe, expect, it } from 'vitest';
import {
  IPHONE_TIMER_STORAGE_KEY,
  iphoneTimerShortcutUrl,
  loadIphoneTimerEnabled,
  offersIphoneTimer,
  saveIphoneTimerEnabled,
} from '../../src/features/session/iphone-timer';
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

describe('iphoneTimerShortcutUrl', () => {
  it('ejecuta el Atajo por su nombre con los segundos como texto', () => {
    expect(iphoneTimerShortcutUrl(90)).toBe(
      'shortcuts://run-shortcut?name=GymBuddy%20descanso&input=text&text=90',
    );
  });

  it('redondea hacia arriba y nunca pide un temporizador de cero', () => {
    expect(iphoneTimerShortcutUrl(84.2)).toMatch(/&text=85$/);
    expect(iphoneTimerShortcutUrl(0)).toMatch(/&text=1$/);
  });
});

describe('offersIphoneTimer', () => {
  it('solo en iOS y solo si se encendió', () => {
    expect(offersIphoneTimer('ios', true)).toBe(true);
    expect(offersIphoneTimer('ios', false)).toBe(false);
    expect(offersIphoneTimer('android', true)).toBe(false);
    expect(offersIphoneTimer('desktop', true)).toBe(false);
  });
});

describe('preferencia del temporizador del iPhone', () => {
  it('empieza apagada y se recuerda al encenderla', () => {
    const storage = memoryStorage();
    expect(loadIphoneTimerEnabled(storage)).toBe(false);

    saveIphoneTimerEnabled(storage, true);
    expect(loadIphoneTimerEnabled(storage)).toBe(true);
  });

  it('lo ilegible o con otra forma queda apagado', () => {
    expect(loadIphoneTimerEnabled(memoryStorage({ [IPHONE_TIMER_STORAGE_KEY]: '{' }))).toBe(false);
    expect(
      loadIphoneTimerEnabled(memoryStorage({ [IPHONE_TIMER_STORAGE_KEY]: '{"enabled":"sí"}' })),
    ).toBe(false);
  });

  it('un almacenamiento que lanza no rompe nada: queda apagado', () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('modo privado');
      },
      setItem: () => {
        throw new Error('lleno');
      },
      removeItem: () => undefined,
    };

    expect(loadIphoneTimerEnabled(broken)).toBe(false);
    expect(() => {
      saveIphoneTimerEnabled(broken, true);
    }).not.toThrow();
  });
});
