import { describe, expect, it } from 'vitest';
import {
  formatWeightForInput,
  MAX_WEIGHT_GRAMS,
  parseWeightInput,
  stepWeight,
} from '../../src/components/weight-field/weight-math';

describe('parseWeightInput', () => {
  it('convierte kilogramos a gramos enteros sin pasar por coma flotante', () => {
    expect(parseWeightInput('82.5')).toEqual({ kind: 'valid', grams: 82_500 });
    expect(parseWeightInput('82.50')).toEqual({ kind: 'valid', grams: 82_500 });
    expect(parseWeightInput('100')).toEqual({ kind: 'valid', grams: 100_000 });
    expect(parseWeightInput('0')).toEqual({ kind: 'valid', grams: 0 });
  });

  it('admite la coma del teclado español, espacios y el sufijo kg', () => {
    expect(parseWeightInput(' 82,5 ')).toEqual({ kind: 'valid', grams: 82_500 });
    expect(parseWeightInput('82,5 kg')).toEqual({ kind: 'valid', grams: 82_500 });
    expect(parseWeightInput('.5')).toEqual({ kind: 'valid', grams: 500 });
  });

  it('redondea a la resolución del contrato (10 g), al alza en el empate', () => {
    expect(parseWeightInput('82.125')).toEqual({ kind: 'valid', grams: 82_130 });
    expect(parseWeightInput('82.124')).toEqual({ kind: 'valid', grams: 82_120 });
  });

  it('distingue el campo vacío de un valor inválido', () => {
    expect(parseWeightInput('')).toEqual({ kind: 'empty' });
    expect(parseWeightInput('   ')).toEqual({ kind: 'empty' });
    expect(parseWeightInput('abc')).toEqual({ kind: 'invalid' });
    expect(parseWeightInput('-5')).toEqual({ kind: 'invalid' });
    expect(parseWeightInput('82.5.1')).toEqual({ kind: 'invalid' });
    expect(parseWeightInput('1.2345')).toEqual({ kind: 'invalid' });
  });

  it('rechaza lo que el contrato no sabe escribir', () => {
    expect(parseWeightInput('9999.99')).toEqual({ kind: 'valid', grams: MAX_WEIGHT_GRAMS });
    expect(parseWeightInput('9999.999')).toEqual({ kind: 'invalid' });
    expect(parseWeightInput('10000')).toEqual({ kind: 'invalid' });
  });
});

describe('stepWeight', () => {
  it('suma y resta saltos de disco en gramos exactos', () => {
    expect(stepWeight(80_000, 1250)).toBe(81_250);
    expect(stepWeight(81_250, 1250)).toBe(82_500);
    expect(stepWeight(82_500, -2500)).toBe(80_000);
  });

  it('parte de cero con el campo vacío y no baja de cero', () => {
    expect(stepWeight(null, 5000)).toBe(5000);
    expect(stepWeight(1250, -2500)).toBe(0);
  });

  it('no pasa del tope del contrato', () => {
    expect(stepWeight(MAX_WEIGHT_GRAMS, 5000)).toBe(MAX_WEIGHT_GRAMS);
  });
});

describe('formatWeightForInput', () => {
  it('recorta los ceros que sobran al editar', () => {
    expect(formatWeightForInput(82_500)).toBe('82.5');
    expect(formatWeightForInput(80_000)).toBe('80');
    expect(formatWeightForInput(81_250)).toBe('81.25');
    expect(formatWeightForInput(0)).toBe('0');
    expect(formatWeightForInput(null)).toBe('');
  });
});
