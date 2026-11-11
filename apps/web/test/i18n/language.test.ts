import { afterEach, describe, expect, it } from 'vitest';
import {
  LANGUAGE_STORAGE_KEY,
  loadLanguagePreference,
  localeFromLanguages,
  plural,
  resolveLocale,
  saveLanguagePreference,
  setCurrentLocale,
  t,
} from '../../src/i18n/index';
import { readNoticeLocale, saveNoticeLocale } from '../../src/i18n/notice-locale';
import type { StorageLike } from '../../src/lib/storage';

function memoryStorage(initial: Record<string, string> = {}): StorageLike & {
  readonly items: Map<string, string>;
} {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
}

afterEach(() => {
  setCurrentLocale('es');
});

describe('localeFromLanguages', () => {
  it('reconoce cualquier variante de español o de inglés', () => {
    expect(localeFromLanguages(['es'])).toBe('es');
    expect(localeFromLanguages(['es-419'])).toBe('es');
    expect(localeFromLanguages(['ES-es'])).toBe('es');
    expect(localeFromLanguages(['en-US'])).toBe('en');
    expect(localeFromLanguages(['en_GB'])).toBe('en');
  });

  it('se queda con el primero de la lista que la app sabe hablar', () => {
    expect(localeFromLanguages(['ca-ES', 'es-ES', 'en'])).toBe('es');
    expect(localeFromLanguages(['de-DE', 'en-US', 'es'])).toBe('en');
  });

  it('sin ninguno conocido, en inglés', () => {
    expect(localeFromLanguages(['pt-BR', 'fr'])).toBe('en');
    expect(localeFromLanguages([])).toBe('en');
  });
});

describe('resolveLocale', () => {
  it('«sistema» sigue al navegador y un idioma elegido manda sobre él', () => {
    expect(resolveLocale('system', ['en-US'])).toBe('en');
    expect(resolveLocale('system', ['es-MX'])).toBe('es');
    expect(resolveLocale('es', ['en-US'])).toBe('es');
    expect(resolveLocale('en', ['es-ES'])).toBe('en');
  });
});

describe('preferencia guardada', () => {
  it('sin nada guardado, o con algo que no es un idioma, es la del sistema', () => {
    expect(loadLanguagePreference(memoryStorage())).toBe('system');
    expect(loadLanguagePreference(memoryStorage({ [LANGUAGE_STORAGE_KEY]: 'klingon' }))).toBe(
      'system',
    );
  });

  it('guarda el idioma elegido y volver al del sistema lo borra', () => {
    const storage = memoryStorage();
    saveLanguagePreference(storage, 'en');
    expect(storage.items.get(LANGUAGE_STORAGE_KEY)).toBe('en');
    expect(loadLanguagePreference(storage)).toBe('en');

    saveLanguagePreference(storage, 'system');
    expect(storage.items.has(LANGUAGE_STORAGE_KEY)).toBe(false);
  });

  it('un almacenamiento que lanza no rompe nada', () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('modo privado');
      },
      setItem: () => {
        throw new Error('modo privado');
      },
      removeItem: () => {
        throw new Error('modo privado');
      },
    };
    expect(loadLanguagePreference(broken)).toBe('system');
    expect(() => {
      saveLanguagePreference(broken, 'en');
    }).not.toThrow();
  });
});

describe('t y plural', () => {
  it('eligen el texto del idioma actual', () => {
    expect(t('Hoy', 'Today')).toBe('Hoy');
    expect(plural(3, ['serie', 'series'], ['set', 'sets'])).toBe('3 series');
    setCurrentLocale('en');
    expect(t('Hoy', 'Today')).toBe('Today');
    expect(plural(1, ['serie', 'series'], ['set', 'sets'])).toBe('1 set');
  });
});

describe('idioma de los avisos', () => {
  function memoryCaches() {
    const entries = new Map<string, string>();
    return {
      open: () =>
        Promise.resolve({
          match: (request: string) => {
            const text = entries.get(request);
            return Promise.resolve(
              text === undefined ? undefined : { text: () => Promise.resolve(text) },
            );
          },
          put: async (request: string, response: Response) => {
            entries.set(request, await response.text());
          },
        }),
    };
  }

  it('lee el que dejó la app y, si no hay, el del sistema', async () => {
    const caches = memoryCaches();
    expect(await readNoticeLocale(caches, ['es-ES'])).toBe('es');
    await saveNoticeLocale(caches, 'en');
    expect(await readNoticeLocale(caches, ['es-ES'])).toBe('en');
    expect(await readNoticeLocale(undefined, ['en-US'])).toBe('en');
  });
});
