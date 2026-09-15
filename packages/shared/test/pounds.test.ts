import { describe, expect, it } from 'vitest';
import {
  centipoundsToGrams,
  formatCentipoundsAsPounds,
  gramsToCentipounds,
  parsePoundsToCentipounds,
  roundCentipoundsToResolution,
} from '../src/domain/pounds';
import { formatGramsAsKilograms, parseKilogramsToGrams } from '../src/domain/units';

describe('centipoundsToGrams', () => {
  it('convierte con la libra internacional y redondea al gramo', () => {
    expect(centipoundsToGrams(10_000)).toBe(45_359);
    expect(centipoundsToGrams(100)).toBe(454);
    expect(centipoundsToGrams(250)).toBe(1134);
    expect(centipoundsToGrams(0)).toBe(0);
  });

  it('rechaza lo que no son centésimas de libra enteras y en rango', () => {
    expect(() => centipoundsToGrams(-5)).toThrow(RangeError);
    expect(() => centipoundsToGrams(12.5)).toThrow(RangeError);
    expect(() => centipoundsToGrams(10_000_000)).toThrow(RangeError);
  });
});

describe('gramsToCentipounds', () => {
  it('lee los gramos en libras con resolución de 0,05 lb', () => {
    expect(gramsToCentipounds(45_359)).toBe(10_000);
    expect(gramsToCentipounds(20_000)).toBe(4410);
    expect(gramsToCentipounds(0)).toBe(0);
  });

  it('rechaza gramos que no son enteros no negativos', () => {
    expect(() => gramsToCentipounds(-1)).toThrow(RangeError);
    expect(() => gramsToCentipounds(0.5)).toThrow(RangeError);
    expect(() => gramsToCentipounds(Number.NaN)).toThrow(RangeError);
  });

  it('devuelve lo tecleado tras pasar por la resolución de 10 g del contrato', () => {
    // Cada múltiplo de 0,05 lb hasta 600 lb: gramos → "kg.00" de la API → gramos → libras.
    for (let centipounds = 0; centipounds <= 60_000; centipounds += 5) {
      const stored = parseKilogramsToGrams(formatGramsAsKilograms(centipoundsToGrams(centipounds)));
      expect(gramsToCentipounds(stored)).toBe(centipounds);
    }
  });
});

describe('roundCentipoundsToResolution', () => {
  it('lleva al múltiplo de 0,05 lb más cercano, al alza en el empate', () => {
    expect(roundCentipoundsToResolution(10_025)).toBe(10_025);
    expect(roundCentipoundsToResolution(10_022)).toBe(10_020);
    expect(roundCentipoundsToResolution(10_023)).toBe(10_025);
    expect(roundCentipoundsToResolution(3)).toBe(5);
  });
});

describe('parsePoundsToCentipounds', () => {
  it('lee la cadena sin pasar por coma flotante', () => {
    expect(parsePoundsToCentipounds('100')).toBe(10_000);
    expect(parsePoundsToCentipounds('1.1')).toBe(110);
    expect(parsePoundsToCentipounds('2.5')).toBe(250);
    expect(parsePoundsToCentipounds('0.05')).toBe(5);
    expect(parsePoundsToCentipounds('99999.99')).toBe(9_999_999);
  });

  it('rechaza lo que no tiene forma de libras', () => {
    expect(() => parsePoundsToCentipounds('')).toThrow(RangeError);
    expect(() => parsePoundsToCentipounds('1.255')).toThrow(RangeError);
    expect(() => parsePoundsToCentipounds('-5')).toThrow(RangeError);
    expect(() => parsePoundsToCentipounds('100000')).toThrow(RangeError);
  });
});

describe('formatCentipoundsAsPounds', () => {
  it('escribe dos decimales', () => {
    expect(formatCentipoundsAsPounds(10_025)).toBe('100.25');
    expect(formatCentipoundsAsPounds(250)).toBe('2.50');
    expect(formatCentipoundsAsPounds(5)).toBe('0.05');
    expect(formatCentipoundsAsPounds(0)).toBe('0.00');
  });
});
