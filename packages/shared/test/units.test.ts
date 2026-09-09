import { describe, expect, it } from 'vitest';
import {
  formatGramsAsKilograms,
  formatGramsAsVolumeKilograms,
  parseKilogramsToGrams,
  parseVolumeKilogramsToGrams,
  roundGramsToApiPrecision,
  rpeToTenths,
  tenthsToRpe,
} from '../src/domain/units';

describe('formatGramsAsKilograms', () => {
  it('escribe siempre dos decimales', () => {
    expect(formatGramsAsKilograms(0)).toBe('0.00');
    expect(formatGramsAsKilograms(1250)).toBe('1.25');
    expect(formatGramsAsKilograms(82_500)).toBe('82.50');
    expect(formatGramsAsKilograms(100_000)).toBe('100.00');
    expect(formatGramsAsKilograms(5)).toBe('0.01');
  });

  it('redondea al alza en el empate los gramos que la API no representa', () => {
    expect(formatGramsAsKilograms(82_504)).toBe('82.50');
    expect(formatGramsAsKilograms(82_505)).toBe('82.51');
    expect(formatGramsAsKilograms(82_509)).toBe('82.51');
  });

  it('rechaza lo que no es un peso almacenable', () => {
    expect(() => formatGramsAsKilograms(-1)).toThrow(RangeError);
    expect(() => formatGramsAsKilograms(82.5)).toThrow(RangeError);
    expect(() => formatGramsAsKilograms(Number.NaN)).toThrow(RangeError);
  });
});

describe('parseKilogramsToGrams', () => {
  it('convierte a gramos enteros exactos', () => {
    expect(parseKilogramsToGrams('82.50')).toBe(82_500);
    expect(parseKilogramsToGrams('82.5')).toBe(82_500);
    expect(parseKilogramsToGrams('1.25')).toBe(1250);
    expect(parseKilogramsToGrams('0')).toBe(0);
    expect(parseKilogramsToGrams('0.005')).toBe(5);
  });

  it('mantiene el valor tras ida y vuelta', () => {
    for (const kilograms of ['0.00', '1.25', '20.00', '82.50', '137.75', '9999.99']) {
      expect(formatGramsAsKilograms(parseKilogramsToGrams(kilograms))).toBe(kilograms);
    }
  });

  it('nunca devuelve un valor en coma flotante', () => {
    // 82.5 * 1000 en punto flotante da 82499.999...: esta es la razón de parsear la cadena.
    for (const kilograms of ['82.5', '0.1', '0.3', '2.675', '117.35']) {
      expect(Number.isInteger(parseKilogramsToGrams(kilograms))).toBe(true);
    }
    expect(parseKilogramsToGrams('2.675')).toBe(2675);
  });

  it('rechaza lo que no es el formato del contrato', () => {
    for (const invalid of ['', '-1', 'abc', '82,50', '82.5000', '12345.00', ' 82.50', '82.']) {
      expect(() => parseKilogramsToGrams(invalid)).toThrow(RangeError);
    }
  });
});

describe('roundGramsToApiPrecision', () => {
  it('redondea a la resolución de diez gramos', () => {
    expect(roundGramsToApiPrecision(1250)).toBe(1250);
    expect(roundGramsToApiPrecision(1254)).toBe(1250);
    expect(roundGramsToApiPrecision(1255)).toBe(1260);
    expect(roundGramsToApiPrecision(1259)).toBe(1260);
  });
});

describe('rpe', () => {
  it('guarda el esfuerzo percibido en décimas enteras', () => {
    expect(rpeToTenths(8.5)).toBe(85);
    expect(rpeToTenths(10)).toBe(100);
    expect(rpeToTenths(1)).toBe(10);
  });

  it('vuelve al valor original', () => {
    for (const rpe of [1, 5.5, 7, 8.5, 10]) {
      expect(tenthsToRpe(rpeToTenths(rpe))).toBe(rpe);
    }
  });

  it('rechaza los valores que no son pasos de media unidad o quedan fuera de rango', () => {
    for (const invalid of [8.3, 0.5, 10.5, 0, -8]) {
      expect(() => rpeToTenths(invalid)).toThrow(RangeError);
    }
    expect(() => tenthsToRpe(5)).toThrow(RangeError);
    expect(() => tenthsToRpe(85.5)).toThrow(RangeError);
  });
});

describe('parseVolumeKilogramsToGrams', () => {
  it('lee el volumen que devuelve la API, que no cabe en el rango de un peso', () => {
    expect(parseVolumeKilogramsToGrams('1480.00')).toBe(1_480_000);
    expect(parseVolumeKilogramsToGrams('0.00')).toBe(0);
    expect(parseVolumeKilogramsToGrams('9999999.99')).toBe(9_999_999_990);
  });

  it('vuelve a la cadena original', () => {
    for (const volume of ['0.00', '1480.00', '82.50', '123456.78']) {
      expect(formatGramsAsVolumeKilograms(parseVolumeKilogramsToGrams(volume))).toBe(volume);
    }
  });

  it('rechaza lo que no cabe en el formato del contrato', () => {
    expect(() => parseVolumeKilogramsToGrams('12345678.00')).toThrow(RangeError);
    expect(() => parseVolumeKilogramsToGrams('-1.00')).toThrow(RangeError);
    expect(() => parseVolumeKilogramsToGrams('mucho')).toThrow(RangeError);
  });
});
