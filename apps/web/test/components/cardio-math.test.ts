import { MAX_CARDIO_DISTANCE_METERS, MAX_CARDIO_DURATION_SECONDS } from '@gymbuddy/shared';
import { describe, expect, it } from 'vitest';
import {
  formatDistanceForInput,
  parseDistanceInput,
} from '../../src/components/distance-field/distance-math';
import {
  DURATION_STEP_SECONDS,
  formatDurationForInput,
  parseDurationInput,
  stepDuration,
} from '../../src/components/duration-field/duration-math';

describe('parseDurationInput', () => {
  it('un número a secas son minutos, y con dos puntos lleva segundos', () => {
    expect(parseDurationInput('30')).toEqual({ kind: 'valid', seconds: 1_800 });
    expect(parseDurationInput(' 25:30 ')).toEqual({ kind: 'valid', seconds: 1_530 });
    expect(parseDurationInput('0:45')).toEqual({ kind: 'valid', seconds: 45 });
    expect(parseDurationInput('20 min')).toEqual({ kind: 'valid', seconds: 1_200 });
  });

  it('distingue el campo vacío de lo que no es una duración', () => {
    expect(parseDurationInput('')).toEqual({ kind: 'empty' });
    for (const text of ['0', '0:00', '25:5', '25:60', '12,5', 'media hora', '-3']) {
      expect(parseDurationInput(text)).toEqual({ kind: 'invalid' });
    }
  });

  it('no pasa del tope del contrato', () => {
    const maxMinutes = MAX_CARDIO_DURATION_SECONDS / 60;
    expect(parseDurationInput(String(maxMinutes))).toEqual({
      kind: 'valid',
      seconds: MAX_CARDIO_DURATION_SECONDS,
    });
    expect(parseDurationInput(`${String(maxMinutes)}:01`)).toEqual({ kind: 'invalid' });
  });
});

describe('formatDurationForInput y stepDuration', () => {
  it('enseña minutos redondos sin segundos y el resto con dos cifras', () => {
    expect(formatDurationForInput(1_800)).toBe('30');
    expect(formatDurationForInput(1_505)).toBe('25:05');
    expect(parseDurationInput(formatDurationForInput(1_505))).toEqual({
      kind: 'valid',
      seconds: 1_505,
    });
  });

  it('suma y resta un minuto sin bajar de uno ni pasar del tope', () => {
    expect(stepDuration(null, DURATION_STEP_SECONDS)).toBe(60);
    expect(stepDuration(1_530, DURATION_STEP_SECONDS)).toBe(1_590);
    expect(stepDuration(90, -DURATION_STEP_SECONDS)).toBe(60);
    expect(stepDuration(MAX_CARDIO_DURATION_SECONDS, DURATION_STEP_SECONDS)).toBe(
      MAX_CARDIO_DURATION_SECONDS,
    );
  });
});

describe('parseDistanceInput y formatDistanceForInput', () => {
  it('convierte kilómetros a metros enteros con la coma o el punto', () => {
    expect(parseDistanceInput('5,25')).toEqual({ kind: 'valid', meters: 5_250 });
    expect(parseDistanceInput('5.25 km')).toEqual({ kind: 'valid', meters: 5_250 });
    expect(parseDistanceInput(',8')).toEqual({ kind: 'valid', meters: 800 });
    expect(parseDistanceInput('0,001')).toEqual({ kind: 'valid', meters: 1 });
    expect(parseDistanceInput('12')).toEqual({ kind: 'valid', meters: 12_000 });
  });

  it('distingue el campo vacío de lo que no se puede guardar', () => {
    expect(parseDistanceInput('  ')).toEqual({ kind: 'empty' });
    for (const text of ['0', ',', '5,2525', '1000', 'cinco', '-1']) {
      expect(parseDistanceInput(text)).toEqual({ kind: 'invalid' });
    }
    expect(parseDistanceInput(String(MAX_CARDIO_DISTANCE_METERS / 1000))).toEqual({
      kind: 'valid',
      meters: MAX_CARDIO_DISTANCE_METERS,
    });
    expect(parseDistanceInput('500,001')).toEqual({ kind: 'invalid' });
  });

  it('enseña los kilómetros sin ceros de más, con la coma del idioma', () => {
    expect(formatDistanceForInput(5_250, 'es')).toBe('5,25');
    expect(formatDistanceForInput(5_250, 'en')).toBe('5.25');
    expect(formatDistanceForInput(3_000, 'es')).toBe('3');
    expect(formatDistanceForInput(800, 'es')).toBe('0,8');
  });
});
