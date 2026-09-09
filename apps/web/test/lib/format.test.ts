import { describe, expect, it } from 'vitest';
import { describeError } from '../../src/lib/errors';
import {
  formatDaysAgo,
  formatDuration,
  formatRpe,
  formatSessionDate,
  formatShortDate,
  formatStopwatch,
  formatVolumeLabel,
  formatWeightLabel,
  formatWeightValue,
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

describe('formatWeightValue', () => {
  it('deja el número del peso sin su unidad, para el eje de una gráfica', () => {
    expect(formatWeightValue(82_500, 'es')).toBe('82,5');
    expect(formatWeightValue(82_500, 'en')).toBe('82.5');
    expect(formatWeightValue(110_000, 'es')).toBe('110');
    expect(formatWeightValue(0, 'es')).toBe('0');
  });
});

describe('formatShortDate', () => {
  it('deja la fecha sin el día de la semana', () => {
    const short = formatShortDate('2026-09-06T18:00:00.000Z', 'es');

    expect(short).toMatch(/^6\b/);
    expect(short).not.toMatch(/2026/);
    expect(short.length).toBeLessThan(formatSessionDate('2026-09-06T18:00:00.000Z', 'es').length);
  });
});

describe('formatSessionDate', () => {
  it('omite el año dentro del año en curso', () => {
    const now = new Date('2026-09-08T12:00:00.000Z');
    expect(formatSessionDate('2026-09-06T18:00:00.000Z', 'en', now)).not.toMatch(/2026/);
    expect(formatSessionDate('2025-09-06T18:00:00.000Z', 'en', now)).toMatch(/2025/);
  });
});

describe('formatRpe', () => {
  it('pone la coma del idioma sin tocar el número', () => {
    expect(formatRpe(8.5, 'es')).toBe('RPE 8,5');
    expect(formatRpe(8.5, 'en')).toBe('RPE 8.5');
    expect(formatRpe(9, 'es')).toBe('RPE 9');
  });
});

describe('formatStopwatch', () => {
  it('crece de minutos a horas sin perder los dos dígitos', () => {
    expect(formatStopwatch(9)).toBe('0:09');
    expect(formatStopwatch(90)).toBe('1:30');
    expect(formatStopwatch(3909)).toBe('1:05:09');
  });

  it('un cronómetro no va hacia atrás ni cuenta fracciones', () => {
    expect(formatStopwatch(-5)).toBe('0:00');
    expect(formatStopwatch(59.9)).toBe('0:59');
  });
});

describe('formatVolumeLabel', () => {
  it('escribe el volumen en kilogramos sin ceros sobrantes', () => {
    expect(formatVolumeLabel(1_320_000, 'es')).toBe('1320 kg');
    expect(formatVolumeLabel(1_320_500, 'es')).toBe('1320,5 kg');
    expect(formatVolumeLabel(1_320_500, 'en')).toBe('1320.5 kg');
    expect(formatVolumeLabel(0, 'es')).toBe('0 kg');
  });
});

describe('formatDaysAgo', () => {
  it('habla como una persona', () => {
    expect(formatDaysAgo(0)).toBe('hoy');
    expect(formatDaysAgo(1)).toBe('ayer');
    expect(formatDaysAgo(4)).toBe('hace 4 días');
  });
});

describe('formatDuration', () => {
  it('cuenta en horas y minutos, sin segundos', () => {
    expect(formatDuration(3930)).toBe('1 h 5 min');
    expect(formatDuration(2700)).toBe('45 min');
    expect(formatDuration(7200)).toBe('2 h');
  });

  it('por debajo del minuto lo dice con palabras', () => {
    expect(formatDuration(0)).toBe('menos de 1 min');
    expect(formatDuration(59)).toBe('menos de 1 min');
    expect(formatDuration(-10)).toBe('menos de 1 min');
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
