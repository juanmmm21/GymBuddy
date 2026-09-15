import { describe, expect, it, vi } from 'vitest';
import {
  NO_WEIGHT_UNITS,
  WEIGHT_UNITS_STORAGE_KEY,
  loadWeightUnits,
  saveWeightUnits,
  weightUnitFor,
  withWeightUnit,
} from '../../src/features/exercises/weight-unit-store';
import type { StorageLike } from '../../src/lib/storage';

const LEG_PRESS = '0b0f1a4e-8f3c-4d6a-9a52-0c1d2e3f4a5b';
const CURL = '6c7d8e9f-0a1b-4c2d-8e3f-4a5b6c7d8e9f';

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

describe('unidad de peso por ejercicio', () => {
  it('sin nada recordado, todo va en kilos', () => {
    expect(weightUnitFor(NO_WEIGHT_UNITS, LEG_PRESS)).toBe('kg');
  });

  it('recuerda las libras de un ejercicio y volver a kilos quita la entrada', () => {
    const pounds = withWeightUnit(NO_WEIGHT_UNITS, LEG_PRESS, 'lb');
    expect(weightUnitFor(pounds, LEG_PRESS)).toBe('lb');
    expect(weightUnitFor(pounds, CURL)).toBe('kg');

    expect(withWeightUnit(pounds, LEG_PRESS, 'kg')).toEqual({});
  });

  it('guarda y vuelve a leer lo recordado', () => {
    const storage = memoryStorage();
    saveWeightUnits(storage, withWeightUnit(NO_WEIGHT_UNITS, LEG_PRESS, 'lb'));

    expect(storage.data.get(WEIGHT_UNITS_STORAGE_KEY)).toBe(JSON.stringify({ [LEG_PRESS]: 'lb' }));
    expect(loadWeightUnits(storage)).toEqual({ [LEG_PRESS]: 'lb' });
  });

  it('una entrada que no es una unidad se descarta sin llevarse las demás', () => {
    const storage = memoryStorage({
      [WEIGHT_UNITS_STORAGE_KEY]: JSON.stringify({ [LEG_PRESS]: 'lb', [CURL]: 'stone' }),
    });

    expect(loadWeightUnits(storage)).toEqual({ [LEG_PRESS]: 'lb' });
  });

  it('lo ilegible o con otra forma deja todo en kilos', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(loadWeightUnits(memoryStorage({ [WEIGHT_UNITS_STORAGE_KEY]: '{roto' }))).toEqual({});
    expect(loadWeightUnits(memoryStorage({ [WEIGHT_UNITS_STORAGE_KEY]: '["lb"]' }))).toEqual({});

    warn.mockRestore();
  });

  it('un almacenamiento que lanza no rompe el registro', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('modo privado');
      },
      setItem: () => {
        throw new Error('modo privado');
      },
      removeItem: () => undefined,
    };

    expect(loadWeightUnits(broken)).toEqual({});
    expect(() => {
      saveWeightUnits(broken, { [LEG_PRESS]: 'lb' });
    }).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(2);

    warn.mockRestore();
  });
});
