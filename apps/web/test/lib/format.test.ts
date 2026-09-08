import { describe, expect, it } from 'vitest';
import { describeError } from '../../src/lib/errors';
import {
  formatDaysAgo,
  formatSessionDate,
  formatWeightLabel,
  pluralize,
} from '../../src/lib/format';
import { ApiContractError, ApiRequestError, ApiTransportError } from '../../src/api/client';

describe('formatWeightLabel', () => {
  it('usa la coma en español y el punto en inglés, sin ceros sobrantes', () => {
    expect(formatWeightLabel('82.50', 'es')).toBe('82,5 kg');
    expect(formatWeightLabel('82.50', 'en')).toBe('82.5 kg');
    expect(formatWeightLabel('100.00', 'es')).toBe('100 kg');
  });
});

describe('formatSessionDate', () => {
  it('omite el año dentro del año en curso', () => {
    const now = new Date('2026-09-08T12:00:00.000Z');
    expect(formatSessionDate('2026-09-06T18:00:00.000Z', 'en', now)).not.toMatch(/2026/);
    expect(formatSessionDate('2025-09-06T18:00:00.000Z', 'en', now)).toMatch(/2025/);
  });
});

describe('formatDaysAgo', () => {
  it('habla como una persona', () => {
    expect(formatDaysAgo(0)).toBe('hoy');
    expect(formatDaysAgo(1)).toBe('ayer');
    expect(formatDaysAgo(4)).toBe('hace 4 días');
  });
});

describe('pluralize', () => {
  it('concuerda en número', () => {
    expect(pluralize(1, 'serie', 'series')).toBe('1 serie');
    expect(pluralize(0, 'serie', 'series')).toBe('0 series');
  });
});

describe('describeError', () => {
  it('traduce cada clase de error a una frase para el usuario', () => {
    expect(describeError(new ApiTransportError('x'))).toMatch(/Sin conexión/);
    expect(describeError(new ApiContractError('x', 502))).toMatch(/misma versión/);
    expect(describeError(new ApiRequestError('unauthorized', 401, 'x'))).toMatch(/caducado/);
    expect(describeError(new ApiRequestError('catalog_unavailable', 503, 'x'))).toMatch(/catálogo/);
    expect(describeError(new ApiRequestError('session_closed', 409, 'La sesión ya se cerró'))).toBe(
      'La sesión ya se cerró',
    );
    expect(describeError(new Error('boom'))).toMatch(/Inténtalo/);
  });
});
